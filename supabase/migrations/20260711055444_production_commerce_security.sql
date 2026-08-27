-- REBALL LOSTBALL production commerce/security hardening.
-- This migration is intentionally additive and keeps the existing catalog/order tables.
-- All trust-sensitive mutations are exposed only to service_role RPC callers.

create extension if not exists pgcrypto;
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Canonical roles and auth-abuse controls
-- ---------------------------------------------------------------------------

create or replace function private.has_role(_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = _role
  );
$$;

create or replace function private.user_has_role(_user_id uuid, _role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

revoke all on function private.has_role(text) from public;
revoke all on function private.user_has_role(uuid, text) from public;
grant execute on function private.has_role(text) to anon, authenticated;
grant execute on function private.user_has_role(uuid, text) to service_role;

create or replace function private.ensure_customer_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'customer')
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;

revoke all on function private.ensure_customer_role() from public;

drop trigger if exists on_auth_user_customer_role on auth.users;
create trigger on_auth_user_customer_role
after insert on auth.users
for each row execute procedure private.ensure_customer_role();

insert into public.user_roles (user_id, role)
select id, 'customer'
from auth.users
on conflict (user_id, role) do nothing;

create table if not exists private.edge_rate_limits (
  scope text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  hit_count integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash),
  constraint edge_rate_limits_hash_check check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint edge_rate_limits_hit_count_check check (hit_count >= 0)
);

alter table private.edge_rate_limits enable row level security;
revoke all on private.edge_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on private.edge_rate_limits to service_role;

create or replace function public.consume_edge_rate_limit_v1(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.edge_rate_limits%rowtype;
  v_now timestamptz := clock_timestamp();
  v_retry_after integer := 0;
  v_allowed boolean := true;
begin
  if p_scope !~ '^[a-z0-9:_-]{1,80}$'
     or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit < 1 or p_limit > 10000
     or p_window_seconds < 1 or p_window_seconds > 604800
     or p_block_seconds < 1 or p_block_seconds > 604800 then
    raise exception using errcode = '22023', message = 'invalid rate-limit arguments';
  end if;

  select * into v_row
  from private.edge_rate_limits
  where scope = p_scope and key_hash = p_key_hash
  for update;

  if not found then
    insert into private.edge_rate_limits (
      scope, key_hash, window_started_at, hit_count, blocked_until, updated_at
    ) values (
      p_scope, p_key_hash, v_now, 1, null, v_now
    )
    returning * into v_row;
  elsif v_row.blocked_until is not null and v_row.blocked_until > v_now then
    v_allowed := false;
    v_retry_after := greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer);
    update private.edge_rate_limits
    set updated_at = v_now
    where scope = p_scope and key_hash = p_key_hash;
  elsif v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now then
    update private.edge_rate_limits
    set window_started_at = v_now,
        hit_count = 1,
        blocked_until = null,
        updated_at = v_now
    where scope = p_scope and key_hash = p_key_hash
    returning * into v_row;
  else
    update private.edge_rate_limits
    set hit_count = hit_count + 1,
        blocked_until = case
          when hit_count + 1 > p_limit then v_now + make_interval(secs => p_block_seconds)
          else null
        end,
        updated_at = v_now
    where scope = p_scope and key_hash = p_key_hash
    returning * into v_row;

    if v_row.hit_count > p_limit then
      v_allowed := false;
      v_retry_after := greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer);
    end if;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'retryAfter', v_retry_after,
    'remaining', greatest(0, p_limit - v_row.hit_count)
  );
end;
$$;

create or replace function public.reset_edge_rate_limit_v1(p_scope text, p_key_hash text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.edge_rate_limits where scope = p_scope and key_hash = p_key_hash;
$$;

revoke all on function public.consume_edge_rate_limit_v1(text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.reset_edge_rate_limit_v1(text, text) from public, anon, authenticated;
grant execute on function public.consume_edge_rate_limit_v1(text, text, integer, integer, integer) to service_role;
grant execute on function public.reset_edge_rate_limit_v1(text, text) to service_role;

create or replace function public.check_signup_identity_v1(p_login_id text, p_email text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'loginIdExists', exists (
      select 1 from public.profiles where lower(login_id) = lower(btrim(p_login_id))
    ),
    'emailExists', exists (
      select 1 from public.profiles
      where lower(auth_email) = lower(btrim(p_email)) or lower(email) = lower(btrim(p_email))
    )
  );
$$;

create or replace function public.resolve_login_email_v1(p_login_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select auth_email
  from public.profiles
  where lower(login_id) = lower(btrim(p_login_id))
  limit 1;
$$;

create or replace function public.resolve_auth_recovery_profile_v1(
  p_identifier text,
  p_name text,
  p_phone text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('authEmail', auth_email)
  from public.profiles
  where btrim(name) = btrim(p_name)
    and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    and (
      lower(login_id) = lower(btrim(p_identifier))
      or lower(auth_email) = lower(btrim(p_identifier))
      or lower(email) = lower(btrim(p_identifier))
    )
    and auth_email is not null
  limit 1;
$$;

-- Auth metadata is persisted by the browser session. Keep it identifier-only and store
-- names, phones, consent flags, and addresses in RLS-protected public tables instead.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_login_id text := lower(nullif(btrim(new.raw_user_meta_data ->> 'login_id'), ''));
  v_provider text := coalesce(nullif(new.raw_app_meta_data ->> 'provider', ''), 'email');
begin
  insert into public.profiles (
    id, login_id, auth_email, email, provider, role,
    marketing_email, marketing_sms, updated_at
  ) values (
    new.id, v_login_id, new.email, new.email, v_provider, 'customer',
    false, false, now()
  )
  on conflict (id) do update
  set login_id = coalesce(excluded.login_id, public.profiles.login_id),
      auth_email = excluded.auth_email,
      email = excluded.email,
      provider = excluded.provider,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure private.handle_new_user();
revoke all on function private.handle_new_user() from public, anon, authenticated;

create or replace function public.complete_signup_profile_v1(
  p_user_id uuid,
  p_login_id text,
  p_email text,
  p_name text,
  p_phone text,
  p_telephone text,
  p_marketing_email boolean,
  p_marketing_sms boolean,
  p_birth_date text,
  p_anniversary_date text,
  p_spouse_birth_date text,
  p_region text,
  p_address_zip text,
  p_address_road text,
  p_address_detail text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_login_id text := lower(btrim(coalesce(p_login_id, '')));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_zip text := btrim(coalesce(p_address_zip, ''));
  v_road text := btrim(coalesce(p_address_road, ''));
begin
  if v_login_id !~ '^[a-z0-9][a-z0-9._-]{3,19}$'
     or v_email !~ '^[^[:space:]@(),]+@[^[:space:]@(),]+\.[^[:space:]@(),]+$'
     or length(btrim(coalesce(p_name, ''))) < 1
     or v_phone !~ '^[0-9]{9,11}$'
     or not exists (
       select 1 from auth.users u
       where u.id = p_user_id and lower(u.email) = v_email
     ) then
    raise exception using errcode = '22023', message = 'invalid signup profile';
  end if;
  if v_road <> '' and v_zip !~ '^[0-9]{5}$' then
    raise exception using errcode = '22023', message = 'invalid signup address';
  end if;

  update public.profiles
  set login_id = v_login_id,
      auth_email = v_email,
      email = v_email,
      name = left(btrim(p_name), 80),
      phone = v_phone,
      telephone = nullif(left(btrim(coalesce(p_telephone, '')), 30), ''),
      provider = 'email',
      marketing_email = coalesce(p_marketing_email, false),
      marketing_sms = coalesce(p_marketing_sms, false),
      birth_date = nullif(left(btrim(coalesce(p_birth_date, '')), 20), ''),
      anniversary_date = nullif(left(btrim(coalesce(p_anniversary_date, '')), 20), ''),
      spouse_birth_date = nullif(left(btrim(coalesce(p_spouse_birth_date, '')), 20), ''),
      region = nullif(left(btrim(coalesce(p_region, '')), 80), ''),
      updated_at = now()
  where id = p_user_id;
  if not found then
    raise exception using errcode = '23503', message = 'signup profile missing';
  end if;

  if v_road <> '' and not exists (
    select 1 from public.addresses where profile_id = p_user_id and is_default
  ) then
    insert into public.addresses (
      profile_id, receiver_name, receiver_phone, zip_code,
      road_address, detail_address, is_default
    ) values (
      p_user_id, left(btrim(p_name), 80), v_phone, v_zip,
      left(v_road, 240), nullif(left(btrim(coalesce(p_address_detail, '')), 240), ''), true
    );
  end if;
end;
$$;

-- Existing rows may contain PII copied into browser-persisted auth metadata. The
-- migration removes only those keys while preserving unrelated provider metadata.
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - array[
  'name', 'phone', 'telephone', 'contact_email', 'marketing_email', 'marketing_sms',
  'birth_date', 'anniversary_date', 'spouse_birth_date', 'region',
  'default_address_zip', 'default_address_road', 'default_address_detail', 'provider'
]::text[]
where coalesce(raw_user_meta_data, '{}'::jsonb) ?| array[
  'name', 'phone', 'telephone', 'contact_email', 'marketing_email', 'marketing_sms',
  'birth_date', 'anniversary_date', 'spouse_birth_date', 'region',
  'default_address_zip', 'default_address_road', 'default_address_detail', 'provider'
];

revoke all on function public.check_signup_identity_v1(text, text) from public, anon, authenticated;
revoke all on function public.resolve_login_email_v1(text) from public, anon, authenticated;
revoke all on function public.resolve_auth_recovery_profile_v1(text, text, text) from public, anon, authenticated;
revoke all on function public.complete_signup_profile_v1(uuid, text, text, text, text, text, boolean, boolean, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.check_signup_identity_v1(text, text) to service_role;
grant execute on function public.resolve_login_email_v1(text) to service_role;
grant execute on function public.resolve_auth_recovery_profile_v1(text, text, text) to service_role;
grant execute on function public.complete_signup_profile_v1(uuid, text, text, text, text, text, boolean, boolean, text, text, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Commerce data required for atomic order/payment processing
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists idempotency_key text,
  add column if not exists request_fingerprint text,
  add column if not exists order_name text,
  add column if not exists guest_lookup_token_hash text,
  add column if not exists guest_lookup_expires_at timestamptz,
  add column if not exists reservation_expires_at timestamptz;

alter table public.payments
  add column if not exists webhook_secret_hash text,
  add column if not exists virtual_due_at timestamptz,
  add column if not exists reconcile_lease_until timestamptz,
  add column if not exists reconcile_lease_token uuid,
  add column if not exists next_reconcile_at timestamptz,
  add column if not exists reconcile_attempts integer not null default 0,
  add column if not exists last_reconcile_error text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.payment_attempts
  add column if not exists request_hash text,
  add column if not exists error_code text,
  add column if not exists reconcile_attempts integer not null default 0,
  add column if not exists sensitive_request_ciphertext text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz;

alter table public.payment_events
  add column if not exists order_id uuid references public.orders(id) on delete cascade,
  add column if not exists dedupe_key text,
  add column if not exists last_error text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.payment_refunds
  add column if not exists payment_attempt_id uuid references public.payment_attempts(id) on delete set null;

update public.payment_events
set dedupe_key = coalesce(nullif(provider_event_id, ''), id::text)
where dedupe_key is null;

alter table public.payment_events alter column dedupe_key set not null;

create unique index if not exists orders_idempotency_key_unique
  on public.orders (idempotency_key) where idempotency_key is not null;
create unique index if not exists orders_guest_lookup_token_hash_unique
  on public.orders (guest_lookup_token_hash) where guest_lookup_token_hash is not null;
create unique index if not exists payments_order_provider_unique
  on public.payments (order_id, provider);
create unique index if not exists payment_events_provider_dedupe_unique
  on public.payment_events (provider, dedupe_key);
create unique index if not exists payment_refunds_attempt_unique
  on public.payment_refunds (payment_attempt_id);
create index if not exists payments_reconcile_due_idx
  on public.payments (next_reconcile_at)
  where next_reconcile_at is not null;

alter table public.product_variants
  add constraint product_variants_stock_nonnegative check (stock_qty >= 0) not valid,
  add constraint product_variants_price_positive check (price_krw > 0) not valid,
  add constraint product_variants_pack_positive check (pack_size > 0) not valid;
alter table public.brands
  add constraint brands_slug_route_safe check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') not valid;
alter table public.products
  add constraint products_slug_route_safe check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') not valid,
  add constraint products_detail_asset_safe check (
    detail_image_url is null or (
      detail_image_url !~ '[<>"[:cntrl:]]'
      and lower(detail_image_url) !~ '^(data|javascript|vbscript|file|blob|http):'
    )
  ) not valid;
alter table public.product_variants
  add constraint product_variants_thumbnail_asset_safe check (
    thumbnail_url is null or (
      thumbnail_url !~ '[<>"[:cntrl:]]'
      and lower(thumbnail_url) !~ '^(data|javascript|vbscript|file|blob|http):'
    )
  ) not valid;
alter table public.inventory_lots
  add constraint inventory_lots_quantities_valid check (
    inbound_qty >= 0 and available_qty >= 0 and available_qty <= inbound_qty
  ) not valid;
alter table public.orders
  add constraint orders_amounts_valid check (
    subtotal_krw >= 0 and shipping_krw >= 0 and discount_krw >= 0 and total_krw >= 0
    and refund_amount >= 0 and refund_amount <= total_krw
    and total_krw = subtotal_krw + shipping_krw - discount_krw
  ) not valid,
  add constraint orders_guest_auth_valid check (
    profile_id is not null
    or (coalesce(guest_lookup_token_hash, '') ~ '^[0-9a-f]{64}$' and guest_lookup_expires_at is not null)
  ) not valid;

alter table public.payment_attempts
  add constraint payment_attempts_sensitive_ciphertext_valid check (
    sensitive_request_ciphertext is null or (
      operation = 'cancel'
      and length(sensitive_request_ciphertext) between 32 and 4096
      and sensitive_request_ciphertext ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{20,}$'
    )
  ) not valid;
alter table public.order_items
  add constraint order_items_values_valid check (
    qty > 0 and unit_price_krw > 0 and line_total_krw = unit_price_krw * qty
  ) not valid;
alter table public.payments
  add constraint payments_amounts_valid check (
    requested_amount > 0 and coalesce(approved_amount, 0) >= 0 and canceled_amount >= 0
  ) not valid;

create table if not exists public.commerce_settings (
  singleton boolean primary key default true check (singleton),
  base_shipping_krw integer not null default 3500 check (base_shipping_krw >= 0),
  free_shipping_threshold_krw integer not null default 50000 check (free_shipping_threshold_krw >= 0),
  remote_area_surcharge_krw integer not null default 2000 check (remote_area_surcharge_krw >= 0),
  reservation_ttl_minutes integer not null default 40 check (reservation_ttl_minutes between 10 and 1440),
  guest_lookup_ttl_days integer not null default 365 check (guest_lookup_ttl_days between 1 and 3650),
  updated_at timestamptz not null default now()
);

insert into public.commerce_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.shipping_surcharge_zones (
  postal_code_prefix text primary key,
  surcharge_krw integer not null check (surcharge_krw >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint shipping_zone_prefix_check check (postal_code_prefix ~ '^[0-9]{1,5}$')
);

insert into public.shipping_surcharge_zones (postal_code_prefix, surcharge_krw, active)
values ('63', 2000, true)
on conflict (postal_code_prefix) do nothing;

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  qty integer not null check (qty > 0),
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'released', 'expired')),
  expires_at timestamptz not null,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, variant_id)
);

create index if not exists inventory_reservations_expiry_idx
  on public.inventory_reservations (expires_at) where status = 'reserved';

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  from_status public.order_status,
  to_status public.order_status,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_created_idx
  on public.order_events (order_id, created_at);

alter table public.commerce_settings enable row level security;
alter table public.shipping_surcharge_zones enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.order_events enable row level security;

revoke all on public.commerce_settings, public.shipping_surcharge_zones,
  public.inventory_reservations, public.order_events from public, anon, authenticated;
grant select, insert, update, delete on public.commerce_settings, public.shipping_surcharge_zones,
  public.inventory_reservations, public.order_events to service_role;
grant select on public.commerce_settings, public.shipping_surcharge_zones,
  public.inventory_reservations, public.order_events to authenticated;

create policy commerce_settings_owner_read on public.commerce_settings
for select to authenticated using (private.has_role('owner_admin'));
create policy shipping_zones_inventory_read on public.shipping_surcharge_zones
for select to authenticated using (
  private.has_role('inventory_manager') or private.has_role('owner_admin')
);
create policy inventory_reservations_manager_read on public.inventory_reservations
for select to authenticated using (
  private.has_role('inventory_manager') or private.has_role('owner_admin')
);
create policy order_events_manager_read on public.order_events
for select to authenticated using (
  private.has_role('cs_manager')
  or private.has_role('inventory_manager')
  or private.has_role('payments_manager')
  or private.has_role('owner_admin')
);

-- Trust-sensitive tables are never writable directly by browser roles.
drop policy if exists orders_self_insert on public.orders;
drop policy if exists profiles_self_insert on public.profiles;
revoke insert, update, delete on public.orders, public.order_items,
  public.order_item_snapshots, public.shipping_snapshots, public.payment_snapshots,
  public.payments, public.payment_attempts, public.payment_events, public.payment_refunds
  from anon, authenticated;
revoke insert, update, delete on public.brands, public.products, public.product_variants
  from anon, authenticated;
revoke insert on public.profiles from authenticated;
grant delete on public.addresses to authenticated;
grant select on public.user_roles, public.order_item_snapshots, public.shipping_snapshots,
  public.payment_snapshots, public.payments, public.payment_refunds to authenticated;

-- Existing read policies are extended only where the job needs the data.
drop policy if exists orders_self_select on public.orders;
create policy orders_self_select on public.orders
for select to authenticated
using (
  (
    (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles as member_identity
      where member_identity.id = orders.profile_id
        and member_identity.id = (select auth.uid())
    )
  )
  or private.has_role('cs_manager')
  or private.has_role('owner_admin')
);

drop policy if exists order_items_self_select on public.order_items;
create policy order_items_self_select on public.order_items
for select to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = order_items.order_id
      and orders.profile_id = (select auth.uid())
  )
  or private.has_role('cs_manager')
  or private.has_role('owner_admin')
);

drop policy if exists shipping_snapshots_self_select on public.shipping_snapshots;
create policy shipping_snapshots_self_select on public.shipping_snapshots
for select to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = shipping_snapshots.order_id
      and orders.profile_id = (select auth.uid())
  )
  or private.has_role('cs_manager')
  or private.has_role('owner_admin')
);

-- ---------------------------------------------------------------------------
-- Private helpers shared by service-only commerce RPCs
-- ---------------------------------------------------------------------------

create or replace function private.valid_order_transition(
  p_from public.order_status,
  p_to public.order_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or case p_from
    when 'draft' then p_to in ('payment_ready', 'canceled')
    when 'payment_ready' then p_to in ('payment_auth_started', 'waiting_for_deposit', 'paid', 'payment_failed', 'canceled', 'partially_canceled')
    when 'payment_auth_started' then p_to in ('waiting_for_deposit', 'paid', 'payment_failed', 'canceled', 'partially_canceled')
    when 'waiting_for_deposit' then p_to in ('paid', 'payment_failed', 'canceled', 'partially_canceled')
    when 'payment_failed' then p_to in ('payment_ready', 'canceled')
    when 'paid' then p_to in ('waiting_for_deposit', 'cancel_requested', 'canceled', 'partially_canceled', 'refunded', 'shipping_ready')
    when 'cancel_requested' then p_to in ('paid', 'waiting_for_deposit', 'canceled', 'partially_canceled')
    when 'partially_canceled' then p_to in ('cancel_requested', 'canceled', 'refunded', 'shipping_ready')
    when 'shipping_ready' then p_to in ('shipped', 'canceled')
    when 'shipped' then p_to in ('delivered')
    else false
  end;
$$;

create or replace function private.release_order_inventory(
  p_order_id uuid,
  p_reason text,
  p_include_consumed boolean default false,
  p_expired boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation record;
  v_released integer := 0;
begin
  for v_reservation in
    select id, variant_id, qty
    from public.inventory_reservations
    where order_id = p_order_id
      and (status = 'reserved' or (p_include_consumed and status = 'consumed'))
    order by variant_id
    for update
  loop
    update public.product_variants
    set stock_qty = stock_qty + v_reservation.qty
    where id = v_reservation.variant_id;

    update public.inventory_reservations
    set status = case when p_expired then 'expired' else 'released' end,
        released_at = now(),
        release_reason = left(coalesce(p_reason, 'released'), 200),
        updated_at = now()
    where id = v_reservation.id;
    v_released := v_released + v_reservation.qty;
  end loop;
  return v_released;
end;
$$;

create or replace function private.consume_order_inventory(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consumed integer;
begin
  update public.inventory_reservations
  set status = 'consumed', updated_at = now()
  where order_id = p_order_id and status = 'reserved';
  get diagnostics v_consumed = row_count;
  return v_consumed;
end;
$$;

create or replace function private.can_access_order(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_guest_token_hash text,
  p_allow_admin boolean default true
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and (
        (p_actor_user_id is not null and o.profile_id = p_actor_user_id)
        or (
          p_guest_token_hash is not null
          and o.profile_id is null
          and o.guest_lookup_token_hash = p_guest_token_hash
          and o.guest_lookup_expires_at > now()
        )
        or (
          p_allow_admin and p_actor_user_id is not null and (
            private.user_has_role(p_actor_user_id, 'cs_manager')
            or private.user_has_role(p_actor_user_id, 'owner_admin')
          )
        )
      )
  );
$$;

create or replace function private.order_payload(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'orderNo', o.order_no,
    'orderName', o.order_name,
    'status', o.status,
    'paymentStatus', o.payment_status,
    'paymentProvider', o.payment_provider,
    'paymentMethod', o.payment_method,
    'subtotalKrw', o.subtotal_krw,
    'shippingKrw', o.shipping_krw,
    'discountKrw', o.discount_krw,
    'refundAmount', o.refund_amount,
    'totalKrw', o.total_krw,
    'address', o.address_snapshot,
    'reservationExpiresAt', o.reservation_expires_at,
    'createdAt', o.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId', i.product_id,
        'variantId', i.variant_id,
        'productName', i.product_name,
        'variantName', i.variant_name,
        'unitPriceKrw', i.unit_price_krw,
        'quantity', i.qty,
        'lineTotalKrw', i.line_total_krw
      ) order by i.id)
      from public.order_items i
      where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_order_id;
$$;

-- Payment operators need status and ledger amounts for cancellation work, but
-- must not receive the shipping address or item-level full-order payload.
create or replace function private.payment_operation_payload(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'orderNo', o.order_no,
    'status', o.status,
    'paymentStatus', o.payment_status,
    'paymentProvider', o.payment_provider,
    'paymentMethod', o.payment_method,
    'subtotalKrw', o.subtotal_krw,
    'shippingKrw', o.shipping_krw,
    'discountKrw', o.discount_krw,
    'refundAmount', o.refund_amount,
    'totalKrw', o.total_krw,
    'createdAt', o.created_at
  )
  from public.orders o
  where o.id = p_order_id;
$$;

revoke all on function private.valid_order_transition(public.order_status, public.order_status) from public;
revoke all on function private.release_order_inventory(uuid, text, boolean, boolean) from public;
revoke all on function private.consume_order_inventory(uuid) from public;
revoke all on function private.can_access_order(uuid, uuid, text, boolean) from public;
revoke all on function private.order_payload(uuid) from public;
revoke all on function private.payment_operation_payload(uuid) from public;

-- ---------------------------------------------------------------------------
-- Atomic order creation, lookup, and reservation release
-- ---------------------------------------------------------------------------

create or replace function public.create_order_v1(
  p_profile_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_items jsonb,
  p_address jsonb,
  p_payment_method public.payment_method,
  p_payment_provider public.payment_provider,
  p_guest_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.orders%rowtype;
  v_settings public.commerce_settings%rowtype;
  v_item record;
  v_variant record;
  v_order_id uuid := gen_random_uuid();
  v_order_no text := 'RB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 24));
  v_normalized_items jsonb := '[]'::jsonb;
  v_subtotal bigint := 0;
  v_shipping integer := 0;
  v_remote_surcharge integer := 0;
  v_total integer;
  v_postal_code text := btrim(coalesce(p_address ->> 'zipCode', ''));
  v_receiver_name text := btrim(coalesce(p_address ->> 'receiverName', ''));
  v_receiver_phone text := regexp_replace(coalesce(p_address ->> 'receiverPhone', ''), '[^0-9]', '', 'g');
  v_road_address text := btrim(coalesce(p_address ->> 'roadAddress', ''));
  v_order_name text;
  v_reservation_expires_at timestamptz;
  v_guest_expires_at timestamptz;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 128
     or p_idempotency_key !~ '^[A-Za-z0-9_-]+$' then
    raise exception using errcode = '22023', message = 'invalid idempotency key';
  end if;
  if coalesce(p_request_fingerprint, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid request fingerprint';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception using errcode = '22023', message = 'invalid order items';
  end if;
  if jsonb_typeof(p_address) <> 'object'
     or length(v_receiver_name) not between 1 and 80
     or v_receiver_phone !~ '^[0-9]{9,11}$'
     or v_postal_code !~ '^[0-9]{5}$'
     or length(v_road_address) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'invalid shipping address';
  end if;
  if p_profile_id is null and coalesce(p_guest_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'guest lookup token is required';
  end if;
  if p_profile_id is not null and not exists (
    select 1 from public.profiles where id = p_profile_id
  ) then
    raise exception using errcode = '23503', message = 'member profile not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('order:' || p_idempotency_key, 0));

  select * into v_existing
  from public.orders
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_existing.request_fingerprint <> p_request_fingerprint
       or v_existing.profile_id is distinct from p_profile_id
       or (p_profile_id is null and v_existing.guest_lookup_token_hash <> p_guest_token_hash) then
      raise exception using errcode = '23505', message = 'idempotency key payload mismatch';
    end if;
    return private.order_payload(v_existing.id) || jsonb_build_object('duplicate', true);
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    where coalesce(e ->> 'variantId', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(e ->> 'quantity', '') !~ '^[1-9][0-9]?$'
  ) then
    raise exception using errcode = '22023', message = 'invalid variant or quantity';
  end if;

  select * into strict v_settings
  from public.commerce_settings
  where singleton = true;

  -- UUID ordering prevents deadlocks between simultaneous multi-item orders.
  for v_item in
    select (e ->> 'variantId')::uuid as variant_id,
           sum((e ->> 'quantity')::integer)::integer as qty
    from jsonb_array_elements(p_items) e
    group by (e ->> 'variantId')::uuid
    order by (e ->> 'variantId')::uuid
  loop
    if v_item.qty < 1 or v_item.qty > 99 then
      raise exception using errcode = '22023', message = 'invalid aggregate quantity';
    end if;

    select
      v.id, v.product_id, v.sku, v.option_model, v.option_color, v.option_design,
      v.grade, v.pack_size, v.price_krw, v.stock_qty, v.active as variant_active,
      p.name as product_name, p.active as product_active
    into v_variant
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = v_item.variant_id
    for update of v;

    if not found or not v_variant.variant_active or not v_variant.product_active then
      raise exception using errcode = 'P0001', message = 'variant is unavailable';
    end if;
    if v_variant.price_krw <= 0 then
      raise exception using errcode = 'P0001', message = 'variant price is unavailable';
    end if;

    update public.product_variants
    set stock_qty = stock_qty - v_item.qty
    where id = v_variant.id and stock_qty >= v_item.qty;
    if not found then
      raise exception using errcode = 'P0001', message = 'insufficient stock';
    end if;

    v_subtotal := v_subtotal + (v_variant.price_krw::bigint * v_item.qty::bigint);
    v_normalized_items := v_normalized_items || jsonb_build_array(jsonb_build_object(
      'productId', v_variant.product_id,
      'variantId', v_variant.id,
      'productName', v_variant.product_name,
      'variantName', concat_ws(' / ',
        nullif(v_variant.option_model, ''), nullif(v_variant.option_color, ''),
        nullif(v_variant.option_design, ''), v_variant.grade::text,
        v_variant.pack_size::text || '구'
      ),
      'unitPriceKrw', v_variant.price_krw,
      'quantity', v_item.qty,
      'lineTotalKrw', v_variant.price_krw * v_item.qty
    ));
  end loop;

  if v_subtotal < 1 or v_subtotal > 2000000000 then
    raise exception using errcode = '22003', message = 'invalid order amount';
  end if;

  select coalesce(max(surcharge_krw), 0) into v_remote_surcharge
  from public.shipping_surcharge_zones
  where active = true and v_postal_code like postal_code_prefix || '%';

  v_shipping := case
    when v_subtotal >= v_settings.free_shipping_threshold_krw then 0
    else v_settings.base_shipping_krw
  end + coalesce(v_remote_surcharge, 0);
  v_total := v_subtotal::integer + v_shipping;
  v_reservation_expires_at := now() + make_interval(mins => v_settings.reservation_ttl_minutes);
  v_guest_expires_at := case
    when p_profile_id is null then now() + make_interval(days => v_settings.guest_lookup_ttl_days)
    else null
  end;

  select x."productName" into v_order_name
  from jsonb_to_recordset(v_normalized_items) as x("productName" text)
  limit 1;
  if jsonb_array_length(v_normalized_items) > 1 then
    v_order_name := left(v_order_name || ' 외 ' || (jsonb_array_length(v_normalized_items) - 1)::text || '건', 100);
  else
    v_order_name := left(v_order_name, 100);
  end if;

  insert into public.orders (
    id, profile_id, order_no, order_name, status, payment_status,
    payment_provider, payment_method, subtotal_krw, shipping_krw,
    discount_krw, total_krw, address_snapshot, idempotency_key,
    request_fingerprint, guest_lookup_token_hash, guest_lookup_expires_at,
    reservation_expires_at, created_at, updated_at
  ) values (
    v_order_id, p_profile_id, v_order_no, v_order_name, 'payment_ready', 'ready',
    p_payment_provider, p_payment_method, v_subtotal::integer, v_shipping,
    0, v_total, jsonb_build_object(
      'receiverName', v_receiver_name,
      'receiverPhone', v_receiver_phone,
      'zipCode', v_postal_code,
      'roadAddress', v_road_address,
      'detailAddress', left(btrim(coalesce(p_address ->> 'detailAddress', '')), 240),
      'memo', left(btrim(coalesce(p_address ->> 'memo', '')), 240)
    ), p_idempotency_key, p_request_fingerprint,
    case when p_profile_id is null then p_guest_token_hash else null end,
    v_guest_expires_at, v_reservation_expires_at, now(), now()
  );

  for v_item in
    select * from jsonb_to_recordset(v_normalized_items) as x(
      "productId" uuid, "variantId" uuid, "productName" text,
      "variantName" text, "unitPriceKrw" integer,
      "quantity" integer, "lineTotalKrw" integer
    )
  loop
    insert into public.order_items (
      order_id, product_id, variant_id, product_name, variant_name,
      unit_price_krw, qty, line_total_krw
    ) values (
      v_order_id, v_item."productId", v_item."variantId", v_item."productName",
      v_item."variantName", v_item."unitPriceKrw", v_item."quantity", v_item."lineTotalKrw"
    );

    insert into public.inventory_reservations (
      order_id, variant_id, qty, status, expires_at
    ) values (
      v_order_id, v_item."variantId", v_item."quantity", 'reserved', v_reservation_expires_at
    );
  end loop;

  insert into public.order_item_snapshots (order_id, payload_json)
  values (v_order_id, v_normalized_items);
  insert into public.shipping_snapshots (order_id, payload_json)
  values (v_order_id, (select address_snapshot from public.orders where id = v_order_id));

  insert into public.payments (
    order_id, provider, provider_order_id, method, status,
    requested_amount, created_at, updated_at
  ) values (
    v_order_id, p_payment_provider, v_order_no, p_payment_method, 'ready',
    v_total, now(), now()
  );

  insert into public.payment_snapshots (order_id, payload_json)
  values (v_order_id, jsonb_build_object(
    'provider', p_payment_provider,
    'method', p_payment_method,
    'requestedAmount', v_total
  ));

  insert into public.order_events (
    order_id, actor_user_id, event_type, from_status, to_status, payload_json
  ) values (
    v_order_id, p_profile_id, 'order_created', null, 'payment_ready',
    jsonb_build_object('itemCount', jsonb_array_length(v_normalized_items), 'reservedUntil', v_reservation_expires_at)
  );
  insert into public.order_events (
    order_id, actor_user_id, event_type, from_status, to_status, payload_json
  ) values (
    v_order_id, p_profile_id, 'inventory_reserved', 'payment_ready', 'payment_ready',
    jsonb_build_object('reservationExpiresAt', v_reservation_expires_at)
  );

  return private.order_payload(v_order_id) || jsonb_build_object('duplicate', false);
end;
$$;

create or replace function public.get_order_v1(
  p_order_no text,
  p_actor_user_id uuid,
  p_guest_token_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  select id into v_order_id
  from public.orders
  where order_no = btrim(p_order_no);

  if v_order_id is null or not private.can_access_order(v_order_id, p_actor_user_id, p_guest_token_hash, true) then
    return null;
  end if;
  return private.order_payload(v_order_id);
end;
$$;

create or replace function public.release_order_reservation_v1(
  p_order_id uuid,
  p_reason text,
  p_order_status public.order_status,
  p_payment_status public.payment_status,
  p_expired boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_released integer;
begin
  select * into strict v_order from public.orders where id = p_order_id for update;
  if v_order.status in ('paid', 'shipping_ready', 'shipped', 'delivered') then
    return private.order_payload(v_order.id) || jsonb_build_object('releasedQty', 0, 'ignored', true);
  end if;
  if not private.valid_order_transition(v_order.status, p_order_status) then
    raise exception using errcode = 'P0001', message = 'invalid order status transition';
  end if;

  v_released := private.release_order_inventory(v_order.id, p_reason, false, p_expired);
  update public.orders
  set status = p_order_status, payment_status = p_payment_status, updated_at = now()
  where id = v_order.id;
  update public.payments
  set status = p_payment_status, updated_at = now()
  where order_id = v_order.id;
  insert into public.order_events (
    order_id, event_type, from_status, to_status, payload_json
  ) values (
    v_order.id, case when p_expired then 'inventory_expired' else 'inventory_released' end,
    v_order.status, p_order_status,
    jsonb_build_object('releasedQty', v_released, 'reason', left(coalesce(p_reason, ''), 200))
  );
  return private.order_payload(v_order.id) || jsonb_build_object('releasedQty', v_released);
end;
$$;

create or replace function public.expire_order_reservations_v1(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_count integer := 0;
begin
  for v_order in
    select o.id
    from public.orders o
    where exists (
      select 1 from public.inventory_reservations r
      where r.order_id = o.id and r.status = 'reserved' and r.expires_at <= now()
    )
      -- Never release an authorization-in-flight or virtual-account reservation by
      -- wall-clock alone. Those states require an authoritative provider re-query.
      and o.status in ('payment_ready', 'payment_failed')
    order by o.id
    for update of o skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    perform public.release_order_reservation_v1(
      v_order.id, 'reservation expired', 'payment_failed', 'expired', true
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.create_order_v1(uuid, text, text, jsonb, jsonb, public.payment_method, public.payment_provider, text) from public, anon, authenticated;
revoke all on function public.get_order_v1(text, uuid, text) from public, anon, authenticated;
revoke all on function public.release_order_reservation_v1(uuid, text, public.order_status, public.payment_status, boolean) from public, anon, authenticated;
revoke all on function public.expire_order_reservations_v1(integer) from public, anon, authenticated;
grant execute on function public.create_order_v1(uuid, text, text, jsonb, jsonb, public.payment_method, public.payment_provider, text) to service_role;
grant execute on function public.get_order_v1(text, uuid, text) to service_role;
grant execute on function public.release_order_reservation_v1(uuid, text, public.order_status, public.payment_status, boolean) to service_role;
grant execute on function public.expire_order_reservations_v1(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Payment confirmation and cancellation claims/finalizers
-- ---------------------------------------------------------------------------

create or replace function public.claim_payment_confirmation_v1(
  p_order_no text,
  p_actor_user_id uuid,
  p_guest_token_hash text,
  p_payment_key text,
  p_amount integer,
  p_idempotency_key text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_attempt public.payment_attempts%rowtype;
begin
  if length(coalesce(p_payment_key, '')) < 6 or length(p_payment_key) > 200
     or length(coalesce(p_idempotency_key, '')) < 16 or length(p_idempotency_key) > 300
     or coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid payment confirmation request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('payment-confirm:' || btrim(p_order_no), 0));
  select * into strict v_order
  from public.orders where order_no = btrim(p_order_no) for update;

  if not private.can_access_order(v_order.id, p_actor_user_id, p_guest_token_hash, false) then
    raise exception using errcode = '42501', message = 'order access denied';
  end if;
  if p_amount <> v_order.total_krw then
    raise exception using errcode = '22023', message = 'payment amount mismatch';
  end if;

  select * into strict v_payment
  from public.payments
  where order_id = v_order.id and provider = v_order.payment_provider
  for update;

  if v_order.status in ('canceled', 'partially_canceled', 'refunded') then
    update public.payment_attempts
    set status = 'superseded_by_cancellation',
        error_code = 'PAYMENT_CANCELED',
        response_json = coalesce(response_json, '{}'::jsonb)
          || jsonb_build_object('supersededBy', 'cancellation'),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = v_order.id and operation = 'confirm'
      and status in ('started', 'in_progress', 'unknown');
    return private.order_payload(v_order.id) || jsonb_build_object(
      'paymentTerminated', true,
      'attemptStatus', 'superseded_by_cancellation',
      'idempotencyKey', p_idempotency_key
    );
  end if;

  if v_order.status = 'cancel_requested' or exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown')
  ) then
    return private.order_payload(v_order.id) || jsonb_build_object(
      'cancellationPending', true,
      'idempotencyKey', p_idempotency_key
    );
  end if;

  if v_order.status in ('paid', 'waiting_for_deposit') then
    if v_payment.toss_payment_key is not null and v_payment.toss_payment_key <> p_payment_key then
      raise exception using errcode = '23505', message = 'order already has another payment';
    end if;
    return private.order_payload(v_order.id) || jsonb_build_object(
      'alreadyFinalized', true, 'idempotencyKey', p_idempotency_key
    );
  end if;

  select * into v_attempt
  from public.payment_attempts
  where idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_attempt.order_id <> v_order.id or v_attempt.request_hash <> p_request_hash then
      raise exception using errcode = '23505', message = 'payment idempotency payload mismatch';
    end if;
    return private.order_payload(v_order.id) || jsonb_build_object(
      'duplicate', true,
      'attemptStatus', v_attempt.status,
      'idempotencyKey', v_attempt.idempotency_key
    );
  end if;

  if exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'confirm'
      and status in ('started', 'in_progress', 'unknown')
  ) then
    raise exception using errcode = '55P03', message = 'payment confirmation already in progress';
  end if;
  if v_order.status = 'payment_auth_started' then
    raise exception using errcode = '55P03', message = 'payment confirmation requires provider reconciliation';
  end if;
  if v_order.reservation_expires_at is not null and v_order.reservation_expires_at <= now() then
    perform private.release_order_inventory(v_order.id, 'payment confirmation after expiry', false, true);
    update public.orders
    set status = 'payment_failed', payment_status = 'expired', updated_at = now()
    where id = v_order.id;
    update public.payments
    set status = 'expired', next_reconcile_at = null,
        reconcile_lease_until = null, reconcile_lease_token = null,
        updated_at = now()
    where id = v_payment.id;
    insert into public.order_events (order_id, event_type, from_status, to_status, payload_json)
    values (v_order.id, 'payment_expired', v_order.status, 'payment_failed', '{}'::jsonb);
    return private.order_payload(v_order.id) || jsonb_build_object('expired', true);
  end if;
  if v_order.status <> 'payment_ready' then
    raise exception using errcode = 'P0001', message = 'order is not ready for payment';
  end if;

  insert into public.payment_attempts (
    order_id, provider, operation, idempotency_key, request_hash,
    request_json, status, created_at, updated_at
  ) values (
    v_order.id, v_order.payment_provider, 'confirm', p_idempotency_key, p_request_hash,
    jsonb_build_object('orderNo', v_order.order_no, 'amount', p_amount),
    'in_progress', now(), now()
  ) returning * into v_attempt;

  -- The provider call happens after this transaction commits. Extend the stock lease so
  -- the expiry worker cannot release inventory while Toss confirmation is in flight.
  update public.inventory_reservations
  set expires_at = greatest(expires_at, now() + interval '15 minutes'),
      updated_at = now()
  where order_id = v_order.id and status = 'reserved';

  update public.payments
  set toss_payment_key = p_payment_key,
      status = 'in_progress',
      next_reconcile_at = now() + interval '2 minutes',
      last_reconcile_error = null,
      updated_at = now()
  where id = v_payment.id;
  update public.orders
  set status = 'payment_auth_started', payment_status = 'in_progress',
      reservation_expires_at = greatest(
        coalesce(reservation_expires_at, now()),
        now() + interval '15 minutes'
      ),
      updated_at = now()
  where id = v_order.id;
  insert into public.order_events (order_id, actor_user_id, event_type, from_status, to_status, payload_json)
  values (
    v_order.id, p_actor_user_id, 'payment_confirmation_claimed',
    v_order.status, 'payment_auth_started', jsonb_build_object('attemptId', v_attempt.id)
  );

  return private.order_payload(v_order.id) || jsonb_build_object(
    'duplicate', false,
    'attemptId', v_attempt.id,
    'idempotencyKey', p_idempotency_key
  );
end;
$$;

create or replace function public.finalize_payment_confirmation_v1(
  p_order_no text,
  p_idempotency_key text,
  p_payment_key text,
  p_amount integer,
  p_provider_status text,
  p_method public.payment_method,
  p_transaction_id text,
  p_approval_no text,
  p_approved_at timestamptz,
  p_webhook_secret_hash text,
  p_virtual_due_at timestamptz,
  p_safe_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_target_order public.order_status;
  v_target_payment public.payment_status;
  v_active_cancel boolean := false;
  v_blocking_cancel boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended('payment-confirm:' || btrim(p_order_no), 0));
  select * into strict v_order from public.orders where order_no = btrim(p_order_no) for update;
  select * into strict v_payment
  from public.payments where order_id = v_order.id and provider = v_order.payment_provider for update;
  select * into strict v_attempt
  from public.payment_attempts
  where order_id = v_order.id and idempotency_key = p_idempotency_key and operation = 'confirm'
  for update;

  if p_amount <> v_order.total_krw or p_amount <> v_payment.requested_amount then
    raise exception using errcode = '22023', message = 'payment amount mismatch';
  end if;
  if v_payment.toss_payment_key is not null and v_payment.toss_payment_key <> p_payment_key then
    raise exception using errcode = '23505', message = 'payment key mismatch';
  end if;

  if v_order.status in ('canceled', 'partially_canceled', 'refunded') then
    update public.payment_attempts
    set status = 'superseded_by_cancellation',
        error_code = 'PAYMENT_CANCELED',
        response_json = coalesce(response_json, '{}'::jsonb)
          || jsonb_build_object('supersededBy', 'cancellation'),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = v_attempt.id and status in ('started', 'in_progress', 'unknown');
    return private.order_payload(v_order.id) || jsonb_build_object(
      'duplicate', true, 'paymentTerminated', true
    );
  end if;

  -- The order row lock makes this stable against a concurrent cancellation claim,
  -- because every claim locks the same order before creating its attempt.
  select exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown')
  ) into v_active_cancel;
  select exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown', 'manual_review')
  ) into v_blocking_cancel;

  case upper(p_provider_status)
    when 'DONE' then
      v_target_order := 'paid';
      v_target_payment := 'done';
    when 'WAITING_FOR_DEPOSIT' then
      v_target_order := 'waiting_for_deposit';
      v_target_payment := 'waiting_for_deposit';
    else
      raise exception using errcode = '22023', message = 'provider payment is not finalized';
  end case;

  -- A late confirmation must not reopen fulfillment while a provider cancellation
  -- is unresolved. Preserve a prior partial-cancel ledger on replay as well.
  if v_blocking_cancel then
    v_target_order := 'cancel_requested';
    if v_payment.status = 'partial_canceled' then
      v_target_payment := 'partial_canceled';
    end if;
  end if;

  -- A virtual-account deposit can complete between the provider confirmation
  -- response and this finalizer acquiring the order lock. Never let the stale
  -- WAITING_FOR_DEPOSIT response downgrade an already authoritative DONE state.
  if v_payment.status = 'done' and upper(p_provider_status) = 'WAITING_FOR_DEPOSIT' then
    v_target_payment := 'done';
    v_target_order := case
      when v_order.status = 'cancel_requested' or v_blocking_cancel then 'cancel_requested'::public.order_status
      when v_order.status in ('shipping_ready', 'shipped', 'delivered') then v_order.status
      else 'paid'::public.order_status
    end;
  end if;

  if v_order.status = v_target_order and v_payment.status = v_target_payment then
    update public.payment_attempts
    set status = 'succeeded', completed_at = coalesce(completed_at, now()), updated_at = now()
    where id = v_attempt.id;
    update public.payments
    set next_reconcile_at = case
          when v_active_cancel then now() + interval '2 minutes'
          when v_blocking_cancel then null
          when v_target_payment = 'waiting_for_deposit' then now() + interval '15 minutes'
          else null
        end,
        reconcile_lease_until = null,
        reconcile_lease_token = null,
        last_reconcile_error = null,
        updated_at = now()
    where id = v_payment.id;
    return private.order_payload(v_order.id) || jsonb_build_object('duplicate', true);
  end if;
  if not private.valid_order_transition(v_order.status, v_target_order) then
    raise exception using errcode = 'P0001', message = 'invalid payment state transition';
  end if;

  if v_target_payment = 'done' then
    perform private.consume_order_inventory(v_order.id);
  elsif v_target_payment = 'waiting_for_deposit' then
    update public.inventory_reservations
    set expires_at = greatest(expires_at, coalesce(p_virtual_due_at, now() + interval '15 minutes')),
        updated_at = now()
    where order_id = v_order.id and status = 'reserved';
    update public.orders
    set reservation_expires_at = greatest(
      coalesce(reservation_expires_at, now()),
      coalesce(p_virtual_due_at, now() + interval '15 minutes')
    )
    where id = v_order.id;
  end if;

  update public.payments
  set toss_payment_key = p_payment_key,
      method = p_method,
      status = v_target_payment,
      approved_amount = case when v_target_payment = 'done' then p_amount else approved_amount end,
      transaction_id = nullif(left(coalesce(p_transaction_id, ''), 200), ''),
      approval_no = nullif(left(coalesce(p_approval_no, ''), 100), ''),
      approved_at = case when v_target_payment = 'done' then coalesce(p_approved_at, now()) else approved_at end,
      webhook_secret_hash = case
        when p_webhook_secret_hash ~ '^[0-9a-f]{64}$' then p_webhook_secret_hash
        else webhook_secret_hash
      end,
      virtual_due_at = case
        when v_target_payment = 'waiting_for_deposit' then coalesce(p_virtual_due_at, virtual_due_at)
        else virtual_due_at
      end,
      next_reconcile_at = case
        when v_active_cancel then now() + interval '2 minutes'
        when v_blocking_cancel then null
        when v_target_payment = 'waiting_for_deposit' then now() + interval '15 minutes'
        else null
      end,
      reconcile_lease_until = null,
      reconcile_lease_token = null,
      last_reconcile_error = null,
      raw_response_json = coalesce(p_safe_payload, '{}'::jsonb),
      updated_at = now()
  where id = v_payment.id;
  update public.orders
  set status = v_target_order,
      payment_status = v_target_payment,
      transaction_id = nullif(left(coalesce(p_transaction_id, ''), 200), ''),
      approval_no = nullif(left(coalesce(p_approval_no, ''), 100), ''),
      updated_at = now()
  where id = v_order.id;
  update public.payment_attempts
  set response_json = coalesce(p_safe_payload, '{}'::jsonb), status = 'succeeded',
      completed_at = now(), updated_at = now()
  where id = v_attempt.id;
  insert into public.payment_snapshots (order_id, payload_json)
  values (v_order.id, coalesce(p_safe_payload, '{}'::jsonb));
  insert into public.order_events (order_id, event_type, from_status, to_status, payload_json)
  values (
    v_order.id,
    case
      when v_target_payment = 'done' then 'payment_paid'
      when v_target_payment = 'waiting_for_deposit' then 'payment_waiting_for_deposit'
      else 'payment_confirmation_replayed_during_cancel'
    end,
    v_order.status, v_target_order,
    jsonb_build_object('providerStatus', upper(p_provider_status), 'attemptId', v_attempt.id)
  );

  return private.order_payload(v_order.id) || jsonb_build_object('duplicate', false);
end;
$$;

create or replace function public.fail_payment_confirmation_v1(
  p_order_no text,
  p_idempotency_key text,
  p_error_code text,
  p_safe_error text,
  p_definitive boolean,
  p_expired boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_released integer := 0;
  v_cancel_pending boolean := false;
  v_cancel_blocking boolean := false;
begin
  select * into strict v_order from public.orders where order_no = btrim(p_order_no) for update;
  select * into strict v_payment
  from public.payments where order_id = v_order.id and provider = v_order.payment_provider for update;
  select * into strict v_attempt
  from public.payment_attempts
  where order_id = v_order.id and idempotency_key = p_idempotency_key and operation = 'confirm'
  for update;

  if v_attempt.status in ('succeeded', 'superseded_by_cancellation') then
    return private.order_payload(v_order.id) || jsonb_build_object('duplicate', true);
  end if;

  select exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown')
  ) into v_cancel_pending;
  select exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown', 'manual_review')
  ) into v_cancel_blocking;

  if v_order.status in ('canceled', 'partially_canceled', 'refunded') then
    update public.payment_attempts
    set status = 'superseded_by_cancellation',
        error_code = 'PAYMENT_CANCELED',
        response_json = coalesce(response_json, '{}'::jsonb)
          || jsonb_build_object('supersededBy', 'cancellation'),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = v_attempt.id and status in ('started', 'in_progress', 'unknown');
    return private.order_payload(v_order.id) || jsonb_build_object(
      'duplicate', true, 'paymentTerminated', true
    );
  end if;

  if v_order.status = 'cancel_requested' or v_cancel_blocking then
    update public.payment_attempts
    set status = 'unknown',
        error_code = left(coalesce(p_error_code, 'PAYMENT_RESULT_UNKNOWN'), 100),
        response_json = jsonb_build_object('message', 'Cancellation is being reconciled'),
        completed_at = null,
        updated_at = now()
    where id = v_attempt.id and status in ('started', 'in_progress', 'unknown');
    update public.payments
    set next_reconcile_at = case when v_cancel_pending then now() + interval '2 minutes' else null end,
        last_reconcile_error = left(coalesce(p_error_code, 'PAYMENT_RESULT_UNKNOWN'), 120),
        updated_at = now()
    where id = v_payment.id;
    insert into public.order_events (order_id, event_type, from_status, to_status, payload_json)
    values (
      v_order.id, 'payment_result_deferred_during_cancellation', v_order.status, v_order.status,
      jsonb_build_object('errorCode', left(coalesce(p_error_code, ''), 100))
    );
    return private.order_payload(v_order.id) || jsonb_build_object(
      'cancellationPending', true, 'definitive', p_definitive
    );
  end if;

  update public.payment_attempts
  set status = case when p_definitive then 'failed' else 'unknown' end,
      error_code = left(coalesce(p_error_code, 'PAYMENT_ERROR'), 100),
      response_json = jsonb_build_object('message', left(coalesce(p_safe_error, 'Payment processing failed'), 240)),
      completed_at = case when p_definitive then now() else null end,
      updated_at = now()
  where id = v_attempt.id and status in ('started', 'in_progress', 'unknown');

  if p_definitive and v_order.status not in ('paid', 'waiting_for_deposit', 'shipping_ready', 'shipped', 'delivered') then
    v_released := private.release_order_inventory(v_order.id, p_safe_error, false, p_expired);
    update public.orders
    set status = 'payment_failed',
        payment_status = case when p_expired then 'expired' else 'failed' end,
        updated_at = now()
    where id = v_order.id;
    update public.payments
    set status = case when p_expired then 'expired' else 'failed' end,
        next_reconcile_at = null,
        reconcile_lease_until = null,
        reconcile_lease_token = null,
        last_reconcile_error = left(coalesce(p_error_code, 'PAYMENT_ERROR'), 120),
        updated_at = now()
    where order_id = v_order.id;
    insert into public.order_events (order_id, event_type, from_status, to_status, payload_json)
    values (
      v_order.id, case when p_expired then 'payment_expired' else 'payment_failed' end,
      v_order.status, 'payment_failed', jsonb_build_object('releasedQty', v_released, 'errorCode', left(coalesce(p_error_code, ''), 100))
    );
  else
    update public.payments
    set next_reconcile_at = now() + interval '1 minute',
        last_reconcile_error = left(coalesce(p_error_code, 'PAYMENT_RESULT_UNKNOWN'), 120),
        updated_at = now()
    where order_id = v_order.id;
    insert into public.order_events (order_id, event_type, from_status, to_status, payload_json)
    values (
      v_order.id, 'payment_result_unknown', v_order.status, v_order.status,
      jsonb_build_object('errorCode', left(coalesce(p_error_code, ''), 100))
    );
  end if;

  return private.order_payload(v_order.id) || jsonb_build_object(
    'definitive', p_definitive, 'releasedQty', v_released
  );
end;
$$;

create or replace function public.claim_payment_cancellation_v1(
  p_order_no text,
  p_actor_user_id uuid,
  p_guest_token_hash text,
  p_idempotency_key text,
  p_request_hash text,
  p_reason text,
  p_sensitive_request_ciphertext text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_allowed boolean := false;
  v_cancel_amount integer := 0;
  v_local_only boolean := false;
  v_requires_refund_account boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended('payment-cancel:' || btrim(p_order_no), 0));
  select * into strict v_order from public.orders where order_no = btrim(p_order_no) for update;
  select * into strict v_payment
  from public.payments where order_id = v_order.id and provider = v_order.payment_provider for update;

  v_allowed := (
    p_actor_user_id is not null and v_order.profile_id = p_actor_user_id
  ) or (
    p_guest_token_hash is not null and v_order.profile_id is null
    and v_order.guest_lookup_token_hash = p_guest_token_hash
    and v_order.guest_lookup_expires_at > now()
  ) or (
    p_actor_user_id is not null and (
      private.user_has_role(p_actor_user_id, 'payments_manager')
      or private.user_has_role(p_actor_user_id, 'owner_admin')
    )
  );
  if not v_allowed then
    raise exception using errcode = '42501', message = 'order access denied';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 2 or length(p_reason) > 200
     or length(coalesce(p_idempotency_key, '')) < 16 or length(p_idempotency_key) > 300
     or coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid cancellation request';
  end if;

  -- Resolve the stable idempotency record before validating current provider state.
  -- A successful virtual-account refund changes payment.status to canceled, but the
  -- original identical request must still be replayable without losing its response.
  select * into v_attempt from public.payment_attempts
  where idempotency_key = p_idempotency_key for update;
  if found then
    if v_attempt.order_id <> v_order.id or v_attempt.request_hash <> p_request_hash then
      raise exception using errcode = '23505', message = 'cancellation idempotency payload mismatch';
    end if;
    return private.payment_operation_payload(v_order.id) || jsonb_build_object(
      'duplicate', true, 'attemptStatus', v_attempt.status,
      'paymentKey', v_payment.toss_payment_key,
      'canceledAmountBefore', coalesce((v_attempt.request_json ->> 'canceledAmountBefore')::integer, 0),
      'cancelAmount', coalesce((v_attempt.request_json ->> 'cancelAmount')::integer, 0),
      'localOnly', coalesce((v_attempt.request_json ->> 'localOnly')::boolean, false)
    );
  end if;

  v_local_only := v_payment.toss_payment_key is null or v_payment.status in ('ready', 'failed', 'expired');
  v_cancel_amount := case
    when v_local_only then 0
    else greatest(0, coalesce(v_payment.approved_amount, v_payment.requested_amount) - v_payment.canceled_amount)
  end;
  v_requires_refund_account := v_order.payment_method = 'virtual_account'
    and v_payment.status in ('done', 'partial_canceled');
  if v_requires_refund_account and (
    p_sensitive_request_ciphertext is null
    or length(p_sensitive_request_ciphertext) not between 32 and 4096
    or p_sensitive_request_ciphertext !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{20,}$'
  ) then
    raise exception using errcode = '22023', message = 'refund account is required for deposited virtual account cancellation';
  end if;
  if not v_requires_refund_account and p_sensitive_request_ciphertext is not null then
    raise exception using errcode = '22023', message = 'refund account is not accepted for this payment';
  end if;

  -- Idempotent retries must be answered before terminal-state rejection. Otherwise a
  -- successful cancellation whose response was lost cannot be replayed safely.
  if v_order.status in ('shipping_ready', 'shipped', 'delivered', 'canceled', 'refunded') then
    raise exception using errcode = 'P0001', message = 'order cannot be canceled';
  end if;
  if exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown')
  ) then
    raise exception using errcode = '55P03', message = 'payment cancellation already in progress';
  end if;

  insert into public.payment_attempts (
    order_id, provider, operation, idempotency_key, request_hash,
    request_json, sensitive_request_ciphertext, status, created_at, updated_at
  ) values (
    v_order.id, v_payment.provider, 'cancel', p_idempotency_key, p_request_hash,
    jsonb_build_object(
      'reason', left(btrim(p_reason), 200),
      'canceledAmountBefore', v_payment.canceled_amount,
      'cancelAmount', v_cancel_amount,
      'localOnly', v_local_only
    ),
    p_sensitive_request_ciphertext, 'in_progress', now(), now()
  ) returning * into v_attempt;

  update public.payments
  set next_reconcile_at = now() + interval '2 minutes',
      reconcile_lease_until = null,
      reconcile_lease_token = null,
      last_reconcile_error = null,
      updated_at = now()
  where id = v_payment.id;

  if v_order.status in ('paid', 'waiting_for_deposit', 'payment_auth_started', 'partially_canceled') then
    update public.orders set status = 'cancel_requested', updated_at = now() where id = v_order.id;
  end if;
  insert into public.order_events (order_id, actor_user_id, event_type, from_status, to_status, payload_json)
  values (
    v_order.id, p_actor_user_id, 'payment_cancel_claimed', v_order.status,
    case when v_order.status in ('paid', 'waiting_for_deposit', 'payment_auth_started', 'partially_canceled') then 'cancel_requested' else v_order.status end,
    jsonb_build_object('attemptId', v_attempt.id)
  );

  return private.payment_operation_payload(v_order.id) || jsonb_build_object(
    'duplicate', false,
    'paymentKey', v_payment.toss_payment_key,
    'canceledAmountBefore', v_payment.canceled_amount,
    'cancelAmount', v_cancel_amount,
    'localOnly', v_local_only,
    'refundAccountRequired', v_requires_refund_account,
    'idempotencyKey', p_idempotency_key
  );
end;
$$;

create or replace function public.finalize_payment_cancellation_v1(
  p_order_no text,
  p_idempotency_key text,
  p_cancel_amount integer,
  p_expected_canceled_total integer,
  p_reason text,
  p_safe_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_released integer := 0;
  v_refund_total integer := 0;
  v_refund_delta integer := 0;
  v_claim_canceled_before integer := 0;
  v_claim_cancel_amount integer := 0;
begin
  select * into strict v_order from public.orders where order_no = btrim(p_order_no) for update;
  select * into strict v_payment
  from public.payments where order_id = v_order.id and provider = v_order.payment_provider for update;
  select * into strict v_attempt
  from public.payment_attempts
  where order_id = v_order.id and idempotency_key = p_idempotency_key and operation = 'cancel'
  for update;

  v_claim_canceled_before := coalesce((v_attempt.request_json ->> 'canceledAmountBefore')::integer, 0);
  v_claim_cancel_amount := coalesce((v_attempt.request_json ->> 'cancelAmount')::integer, 0);

  if p_expected_canceled_total < 0 or p_expected_canceled_total > v_payment.requested_amount then
    raise exception using errcode = '22023', message = 'invalid expected cancellation total';
  end if;
  if p_cancel_amount <> v_claim_cancel_amount
     or p_expected_canceled_total <> v_claim_canceled_before + v_claim_cancel_amount then
    raise exception using errcode = '22023', message = 'cancellation claim payload mismatch';
  end if;
  if v_order.status = 'canceled'
     and v_payment.canceled_amount >= p_expected_canceled_total then
    update public.payment_attempts
    set status = 'succeeded', response_json = coalesce(p_safe_payload, response_json, '{}'::jsonb),
        sensitive_request_ciphertext = null,
        completed_at = coalesce(completed_at, now()), updated_at = now()
    where id = v_attempt.id;
    update public.payments
    set next_reconcile_at = null,
        reconcile_lease_until = null,
        reconcile_lease_token = null,
        last_reconcile_error = null,
        updated_at = now()
    where id = v_payment.id;
    update public.payment_attempts
    set status = 'superseded_by_cancellation',
        error_code = 'PAYMENT_CANCELED',
        response_json = coalesce(response_json, '{}'::jsonb)
          || jsonb_build_object('supersededBy', 'cancellation'),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = v_order.id and operation = 'confirm'
      and status in ('started', 'in_progress', 'unknown');
    update public.payment_attempts
    set status = 'succeeded',
        error_code = null,
        sensitive_request_ciphertext = null,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = v_order.id and operation = 'cancel' and status = 'manual_review';
    return private.payment_operation_payload(v_order.id) || jsonb_build_object('duplicate', true);
  end if;
  v_refund_total := least(coalesce(v_payment.approved_amount, 0), p_expected_canceled_total);
  v_refund_delta := greatest(0, v_refund_total - v_order.refund_amount);

  v_released := private.release_order_inventory(v_order.id, p_reason, true, false);
  update public.orders
  set status = 'canceled', payment_status = 'canceled',
      refund_amount = greatest(refund_amount, v_refund_total),
      updated_at = now()
  where id = v_order.id;

  update public.payments
  set status = 'canceled',
      canceled_amount = greatest(canceled_amount, p_expected_canceled_total),
      canceled_at = now(), raw_response_json = coalesce(p_safe_payload, raw_response_json),
      next_reconcile_at = null,
      reconcile_lease_until = null,
      reconcile_lease_token = null,
      last_reconcile_error = null,
      updated_at = now()
  where id = v_payment.id;
  update public.payment_attempts
  set status = 'succeeded', response_json = coalesce(p_safe_payload, '{}'::jsonb),
      sensitive_request_ciphertext = null,
      completed_at = now(), updated_at = now()
  where id = v_attempt.id;
  update public.payment_attempts
  set status = 'superseded_by_cancellation',
      error_code = 'PAYMENT_CANCELED',
      response_json = coalesce(response_json, '{}'::jsonb)
        || jsonb_build_object('supersededBy', 'cancellation'),
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where order_id = v_order.id and operation = 'confirm'
    and status in ('started', 'in_progress', 'unknown');
  update public.payment_attempts
  set status = 'succeeded',
      error_code = null,
      sensitive_request_ciphertext = null,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where order_id = v_order.id and operation = 'cancel' and status = 'manual_review';

  if v_refund_delta > 0 then
    insert into public.payment_refunds (
      payment_id, payment_attempt_id, cancel_reason, cancel_amount,
      refund_status, requested_at, completed_at
    ) values (
      v_payment.id, v_attempt.id, left(btrim(p_reason), 200), v_refund_delta,
      'completed', now(), now()
    ) on conflict (payment_attempt_id) do nothing;
  end if;
  insert into public.order_events (order_id, event_type, from_status, to_status, payload_json)
  values (
    v_order.id, 'payment_canceled', v_order.status, 'canceled',
    jsonb_build_object(
      'providerCancelAmount', p_cancel_amount,
      'refundAmount', v_refund_delta,
      'releasedQty', v_released
    )
  );
  return private.payment_operation_payload(v_order.id) || jsonb_build_object('releasedQty', v_released, 'duplicate', false);
end;
$$;

create or replace function public.fail_payment_cancellation_v1(
  p_order_no text,
  p_idempotency_key text,
  p_error_code text,
  p_safe_error text,
  p_definitive boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_other_active boolean := false;
  v_other_blocking boolean := false;
  v_to_status public.order_status;
begin
  select * into strict v_order from public.orders where order_no = btrim(p_order_no) for update;
  select * into strict v_payment
  from public.payments where order_id = v_order.id and provider = v_order.payment_provider for update;
  select * into v_attempt
  from public.payment_attempts
  where order_id = v_order.id and idempotency_key = p_idempotency_key and operation = 'cancel'
  for update;
  if not found then
    return private.payment_operation_payload(v_order.id) || jsonb_build_object('stale', true);
  end if;
  if v_attempt.status in ('succeeded', 'partially_succeeded') then
    return private.payment_operation_payload(v_order.id) || jsonb_build_object('duplicate', true);
  end if;
  if v_attempt.status not in ('started', 'in_progress', 'unknown') then
    return private.payment_operation_payload(v_order.id) || jsonb_build_object('stale', true, 'attemptStatus', v_attempt.status);
  end if;

  update public.payment_attempts
  set status = case when p_definitive then 'failed' else 'unknown' end,
      error_code = left(coalesce(p_error_code, 'CANCEL_ERROR'), 100),
      response_json = jsonb_build_object('message', left(coalesce(p_safe_error, 'Cancellation failed'), 240)),
      sensitive_request_ciphertext = case when p_definitive then null else sensitive_request_ciphertext end,
      completed_at = case when p_definitive then now() else null end,
      updated_at = now()
  where id = v_attempt.id;

  select exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel' and id <> v_attempt.id
      and status in ('started', 'in_progress', 'unknown')
  ) into v_other_active;
  select exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel' and id <> v_attempt.id
      and status in ('started', 'in_progress', 'unknown', 'manual_review')
  ) into v_other_blocking;
  v_to_status := v_order.status;

  if p_definitive and v_order.status = 'cancel_requested' and not v_other_blocking then
    v_to_status := case v_payment.status
      when 'done' then 'paid'::public.order_status
      when 'waiting_for_deposit' then 'waiting_for_deposit'::public.order_status
      when 'partial_canceled' then 'partially_canceled'::public.order_status
      else 'payment_auth_started'::public.order_status
    end;
    update public.orders
    set status = v_to_status, updated_at = now()
    where id = v_order.id;
  end if;
  update public.payments
  set next_reconcile_at = case
        when not p_definitive then now() + interval '2 minutes'
        when v_other_active then next_reconcile_at
        when not v_other_blocking and v_payment.status = 'in_progress' then now() + interval '1 minute'
        else null
      end,
      reconcile_lease_until = case when p_definitive and not v_other_active then null else reconcile_lease_until end,
      reconcile_lease_token = case when p_definitive and not v_other_active then null else reconcile_lease_token end,
      last_reconcile_error = left(coalesce(p_error_code, 'CANCEL_ERROR'), 120),
      updated_at = now()
  where id = v_payment.id;
  insert into public.order_events (order_id, event_type, from_status, to_status, payload_json)
  values (
    v_order.id, case when p_definitive then 'payment_cancel_failed' else 'payment_cancel_unknown' end,
    v_order.status, v_to_status,
    jsonb_build_object(
      'errorCode', left(coalesce(p_error_code, ''), 100),
      'preservedByBlockingCancellation', v_other_blocking
    )
  );
  return private.payment_operation_payload(v_order.id) || jsonb_build_object(
    'definitive', p_definitive,
    'preservedByBlockingCancellation', v_other_blocking
  );
end;
$$;

create or replace function public.mark_payment_cancellation_review_v1(
  p_order_no text,
  p_idempotency_key text,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_other_active boolean := false;
  v_target_status public.order_status;
begin
  select * into strict v_order from public.orders where order_no = btrim(p_order_no) for update;
  select * into strict v_payment
  from public.payments where order_id = v_order.id and provider = v_order.payment_provider for update;
  select * into v_attempt
  from public.payment_attempts
  where order_id = v_order.id and idempotency_key = p_idempotency_key and operation = 'cancel'
  for update;
  if not found or v_attempt.status not in ('started', 'in_progress', 'unknown') then
    return private.payment_operation_payload(v_order.id) || jsonb_build_object('stale', true);
  end if;

  update public.payment_attempts
  set status = 'manual_review',
      error_code = left(coalesce(p_error_code, 'CANCELLATION_MANUAL_REVIEW'), 100),
      response_json = coalesce(response_json, '{}'::jsonb)
        || jsonb_build_object('manualReview', true),
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = v_attempt.id;

  select exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel' and id <> v_attempt.id
      and status in ('started', 'in_progress', 'unknown')
  ) into v_other_active;
  v_target_status := v_order.status;
  if v_order.status in ('paid', 'waiting_for_deposit', 'payment_auth_started', 'partially_canceled') then
    v_target_status := 'cancel_requested';
    update public.orders set status = v_target_status, updated_at = now() where id = v_order.id;
  end if;

  if not v_other_active then
    update public.payments
    set next_reconcile_at = null,
        reconcile_lease_until = null,
        reconcile_lease_token = null,
        last_reconcile_error = 'CANCELLATION_MANUAL_REVIEW',
        updated_at = now()
    where id = v_payment.id;
  end if;
  insert into public.order_events (order_id, event_type, from_status, to_status, payload_json)
  values (
    v_order.id, 'payment_cancel_manual_review', v_order.status, v_target_status,
    jsonb_build_object('errorCode', left(coalesce(p_error_code, ''), 100))
  );
  return private.payment_operation_payload(v_order.id) || jsonb_build_object('manualReview', true);
end;
$$;

revoke all on function public.claim_payment_confirmation_v1(text, uuid, text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.finalize_payment_confirmation_v1(text, text, text, integer, text, public.payment_method, text, text, timestamptz, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.fail_payment_confirmation_v1(text, text, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.claim_payment_cancellation_v1(text, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.finalize_payment_cancellation_v1(text, text, integer, integer, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_payment_cancellation_v1(text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.mark_payment_cancellation_review_v1(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_payment_confirmation_v1(text, uuid, text, text, integer, text, text) to service_role;
grant execute on function public.finalize_payment_confirmation_v1(text, text, text, integer, text, public.payment_method, text, text, timestamptz, text, timestamptz, jsonb) to service_role;
grant execute on function public.fail_payment_confirmation_v1(text, text, text, text, boolean, boolean) to service_role;
grant execute on function public.claim_payment_cancellation_v1(text, uuid, text, text, text, text, text) to service_role;
grant execute on function public.finalize_payment_cancellation_v1(text, text, integer, integer, text, jsonb) to service_role;
grant execute on function public.fail_payment_cancellation_v1(text, text, text, text, boolean) to service_role;
grant execute on function public.mark_payment_cancellation_review_v1(text, text, text) to service_role;

-- Provider-backed reconciliation queue. Authorization-in-flight and virtual-account
-- reservations are released only after the payment provider reports a terminal state.
create or replace function public.claim_payment_reconciliation_v1(
  p_limit integer default 25,
  p_lease_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_token uuid;
  v_jobs jsonb := '[]'::jsonb;
begin
  if p_limit < 1 or p_limit > 100 or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception using errcode = '22023', message = 'invalid reconciliation lease';
  end if;

  for v_job in
    select
      p.id as payment_id,
      p.toss_payment_key,
      p.requested_amount,
      p.canceled_amount,
      p.status as payment_status,
      p.virtual_due_at,
      p.reconcile_attempts as payment_reconcile_attempts,
      o.order_no,
      o.status as order_status,
      o.payment_method,
      active_cancel.id as cancel_attempt_id,
      active_cancel.idempotency_key as cancel_idempotency_key,
      active_cancel.request_json as cancel_request_json,
      active_cancel.sensitive_request_ciphertext as cancel_sensitive_ciphertext,
      active_cancel.reconcile_attempts as cancel_reconcile_attempts,
      active_cancel.id is not null as has_active_cancel
    from public.payments p
    join public.orders o on o.id = p.order_id
    left join lateral (
      select a.id, a.idempotency_key, a.request_json, a.sensitive_request_ciphertext, a.reconcile_attempts
      from public.payment_attempts a
      where a.order_id = o.id and a.operation = 'cancel'
        and a.status in ('started', 'in_progress', 'unknown')
      order by a.created_at, a.id
      limit 1
    ) active_cancel on true
    where p.toss_payment_key is not null
      and p.next_reconcile_at is not null
      and p.next_reconcile_at <= now()
      and (p.reconcile_lease_until is null or p.reconcile_lease_until <= now())
      and (
        o.status in ('payment_auth_started', 'waiting_for_deposit')
        or active_cancel.id is not null
      )
    order by p.next_reconcile_at, p.id
    for update of p skip locked
    limit p_limit
  loop
    v_token := gen_random_uuid();
    update public.payments
    set reconcile_lease_token = v_token,
        reconcile_lease_until = now() + make_interval(secs => p_lease_seconds),
        reconcile_attempts = reconcile_attempts + 1,
        updated_at = now()
    where id = v_job.payment_id;
    if v_job.cancel_attempt_id is not null then
      update public.payment_attempts
      set reconcile_attempts = reconcile_attempts + 1, updated_at = now()
      where id = v_job.cancel_attempt_id;
    end if;

    v_jobs := v_jobs || jsonb_build_array(jsonb_build_object(
      'paymentId', v_job.payment_id,
      'leaseToken', v_token,
      'orderNo', v_job.order_no,
      'paymentKey', v_job.toss_payment_key,
      'amount', v_job.requested_amount,
      'canceledAmount', v_job.canceled_amount,
      'orderStatus', v_job.order_status,
      'paymentStatus', v_job.payment_status,
      'paymentMethod', v_job.payment_method,
      'virtualDueAt', v_job.virtual_due_at,
      'hasActiveCancel', v_job.has_active_cancel,
      'cancelAttemptKey', v_job.cancel_idempotency_key,
      'cancelReason', v_job.cancel_request_json ->> 'reason',
      'cancelSensitiveCiphertext', v_job.cancel_sensitive_ciphertext,
      'cancelAmount', coalesce((v_job.cancel_request_json ->> 'cancelAmount')::integer, 0),
      'canceledAmountBefore', coalesce((v_job.cancel_request_json ->> 'canceledAmountBefore')::integer, 0),
      'cancelReconcileAttempts', coalesce(v_job.cancel_reconcile_attempts, 0) + case when v_job.cancel_attempt_id is null then 0 else 1 end,
      'paymentReconcileAttempts', v_job.payment_reconcile_attempts
    ));
  end loop;
  return v_jobs;
end;
$$;

create or replace function public.complete_payment_reconciliation_v1(
  p_payment_id uuid,
  p_lease_token uuid,
  p_next_seconds integer,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_next_seconds < 0 or p_next_seconds > 86400 then
    raise exception using errcode = '22023', message = 'invalid reconciliation schedule';
  end if;
  update public.payments
  set reconcile_lease_until = null,
      reconcile_lease_token = null,
      next_reconcile_at = case
        when p_next_seconds = 0 then null
        else now() + make_interval(secs => p_next_seconds)
      end,
      last_reconcile_error = nullif(left(coalesce(p_error_code, ''), 120), ''),
      updated_at = now()
  where id = p_payment_id and reconcile_lease_token = p_lease_token;
  if not found then
    raise exception using errcode = '40001', message = 'stale reconciliation lease';
  end if;
end;
$$;

revoke all on function public.claim_payment_reconciliation_v1(integer, integer) from public, anon, authenticated;
revoke all on function public.complete_payment_reconciliation_v1(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.claim_payment_reconciliation_v1(integer, integer) to service_role;
grant execute on function public.complete_payment_reconciliation_v1(uuid, uuid, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- Webhook deduplication and authoritative payment-state application
-- ---------------------------------------------------------------------------

create or replace function public.verify_payment_webhook_secret_v1(
  p_order_no text,
  p_secret_hash text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.webhook_secret_hash is not null
      and p_secret_hash ~ '^[0-9a-f]{64}$'
      and p.webhook_secret_hash = p_secret_hash
    then jsonb_build_object(
      'valid', true,
      'paymentKey', p.toss_payment_key,
      'amount', p.requested_amount
    )
    else jsonb_build_object('valid', false)
  end
  from public.payments p
  join public.orders o on o.id = p.order_id
  where o.order_no = btrim(p_order_no)
  limit 1;
$$;

create or replace function public.claim_payment_webhook_v1(
  p_order_no text,
  p_event_type text,
  p_dedupe_key text,
  p_safe_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_event public.payment_events%rowtype;
begin
  if length(coalesce(p_event_type, '')) < 2 or length(p_event_type) > 100
     or length(coalesce(p_dedupe_key, '')) < 8 or length(p_dedupe_key) > 300 then
    raise exception using errcode = '22023', message = 'invalid webhook envelope';
  end if;
  select * into strict v_order from public.orders where order_no = btrim(p_order_no) for update;
  select * into strict v_payment
  from public.payments where order_id = v_order.id and provider = v_order.payment_provider for update;

  insert into public.payment_events (
    payment_id, order_id, provider, event_type, provider_event_id,
    dedupe_key, payload_json, processing_status, received_at, updated_at
  ) values (
    v_payment.id, v_order.id, v_payment.provider, left(p_event_type, 100),
    left(p_dedupe_key, 300), left(p_dedupe_key, 300),
    coalesce(p_safe_payload, '{}'::jsonb), 'received', now(), now()
  ) on conflict (provider, dedupe_key) do nothing;

  select * into strict v_event
  from public.payment_events
  where provider = v_payment.provider and dedupe_key = p_dedupe_key
  for update;

  if v_event.order_id <> v_order.id or v_event.event_type <> p_event_type then
    raise exception using errcode = '23505', message = 'webhook dedupe payload mismatch';
  end if;
  if v_event.processing_status = 'processed' then
    return jsonb_build_object('eventId', v_event.id, 'duplicate', true, 'processed', true);
  end if;
  if v_event.processing_status = 'processing' and v_event.updated_at > now() - interval '5 minutes' then
    return jsonb_build_object('eventId', v_event.id, 'duplicate', true, 'processing', true);
  end if;

  update public.payment_events
  set processing_status = 'processing', last_error = null,
      payload_json = coalesce(p_safe_payload, payload_json), updated_at = now()
  where id = v_event.id;
  return jsonb_build_object('eventId', v_event.id, 'duplicate', false, 'processed', false);
end;
$$;

create or replace function public.apply_payment_webhook_v1(
  p_event_id uuid,
  p_order_no text,
  p_payment_key text,
  p_amount integer,
  p_canceled_amount integer,
  p_provider_status text,
  p_transaction_id text,
  p_approval_no text,
  p_approved_at timestamptz,
  p_virtual_due_at timestamptz,
  p_webhook_secret_hash text,
  p_safe_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.payment_events%rowtype;
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_from_status public.order_status;
  v_target_order public.order_status;
  v_target_payment public.payment_status;
  v_status text := upper(btrim(p_provider_status));
  v_released integer := 0;
  v_new_canceled_amount integer;
  v_cancel_delta integer := 0;
  v_refund_total integer := 0;
  v_refund_delta integer := 0;
  v_active_cancel boolean := false;
  v_blocking_cancel boolean := false;
  v_partial_blocking_unresolved boolean := false;
  v_pending_cancel boolean := false;
begin
  select * into strict v_event from public.payment_events where id = p_event_id for update;
  select * into strict v_order from public.orders where id = v_event.order_id and order_no = btrim(p_order_no) for update;
  select * into strict v_payment from public.payments where id = v_event.payment_id for update;
  v_from_status := v_order.status;

  if v_event.processing_status = 'processed' then
    return private.order_payload(v_order.id) || jsonb_build_object('duplicate', true);
  end if;
  if p_amount <> v_order.total_krw or p_amount <> v_payment.requested_amount then
    raise exception using errcode = '22023', message = 'webhook payment amount mismatch';
  end if;
  if coalesce(p_canceled_amount, 0) < 0
     or coalesce(p_canceled_amount, 0) > v_payment.requested_amount then
    raise exception using errcode = '22023', message = 'webhook canceled amount mismatch';
  end if;
  if v_payment.toss_payment_key is not null and p_payment_key is not null
     and v_payment.toss_payment_key <> p_payment_key then
    raise exception using errcode = '23505', message = 'webhook payment key mismatch';
  end if;

  -- The locked order serializes this check with cancellation claims.
  select exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown')
  ) into v_active_cancel;
  select exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown', 'manual_review')
  ) into v_blocking_cancel;

  case v_status
    when 'DONE' then
      v_target_order := 'paid'; v_target_payment := 'done';
    when 'WAITING_FOR_DEPOSIT' then
      v_target_order := 'waiting_for_deposit'; v_target_payment := 'waiting_for_deposit';
    when 'IN_PROGRESS' then
      v_target_order := 'payment_auth_started'; v_target_payment := 'in_progress';
    when 'READY' then
      v_target_order := 'payment_ready'; v_target_payment := 'ready';
    when 'CANCELED' then
      v_target_order := 'canceled'; v_target_payment := 'canceled';
      v_new_canceled_amount := v_payment.requested_amount;
    when 'PARTIAL_CANCELED' then
      v_target_order := 'partially_canceled'; v_target_payment := 'partial_canceled';
      v_new_canceled_amount := coalesce(p_canceled_amount, 0);
      if v_new_canceled_amount <= 0 or v_new_canceled_amount >= v_payment.requested_amount then
        raise exception using errcode = '22023', message = 'invalid partial cancellation amount';
      end if;
    when 'ABORTED' then
      v_target_order := case when v_order.status = 'cancel_requested' then 'canceled'::public.order_status else 'payment_failed'::public.order_status end;
      v_target_payment := 'failed';
    when 'EXPIRED' then
      v_target_order := case when v_order.status = 'cancel_requested' then 'canceled'::public.order_status else 'payment_failed'::public.order_status end;
      v_target_payment := 'expired';
    else
      raise exception using errcode = '22023', message = 'unsupported provider status';
  end case;

  if v_status = 'PARTIAL_CANCELED' and v_blocking_cancel then
    select exists (
      select 1 from public.payment_attempts
      where order_id = v_order.id and operation = 'cancel'
        and status in ('started', 'in_progress', 'unknown', 'manual_review')
        and greatest(v_payment.canceled_amount, coalesce(p_canceled_amount, 0))
          <= coalesce((request_json ->> 'canceledAmountBefore')::integer, 0)
    ) into v_partial_blocking_unresolved;
  end if;

  -- Provider payment truth is recorded, but fulfillment remains blocked until the
  -- outstanding cancellation has a definitive result.
  if v_blocking_cancel and (
    v_status in ('DONE', 'WAITING_FOR_DEPOSIT')
    or (v_status = 'PARTIAL_CANCELED' and v_partial_blocking_unresolved)
  ) then
    v_target_order := 'cancel_requested';
    if v_payment.status = 'partial_canceled' then
      v_target_payment := 'partial_canceled';
    end if;
  end if;

  -- The provider object is re-queried before this RPC, but a confirmation
  -- response or another worker can still be older than a DONE state already
  -- committed locally. Provider pre-settlement states must be monotonic here.
  if v_payment.status = 'done' and v_status in ('READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT') then
    v_target_order := v_order.status;
    v_target_payment := 'done';
  elsif v_payment.status = 'partial_canceled'
        and v_status in ('READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'DONE') then
    v_target_order := v_order.status;
    v_target_payment := 'partial_canceled';
  elsif v_payment.status = 'canceled'
        and v_status in ('READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'DONE', 'PARTIAL_CANCELED') then
    v_target_order := v_order.status;
    v_target_payment := 'canceled';
  end if;

  -- Replayed or out-of-order lower states never downgrade terminal fulfillment.
  if v_order.status in ('shipping_ready', 'shipped', 'delivered')
     and v_target_order not in ('shipping_ready', 'shipped', 'delivered') then
    v_target_order := v_order.status;
  elsif not private.valid_order_transition(v_order.status, v_target_order) then
    -- Repeated READY/IN_PROGRESS events after a final state are recorded but harmless.
    if v_order.status in ('waiting_for_deposit', 'paid', 'cancel_requested', 'canceled', 'partially_canceled', 'refunded')
       and v_target_order in ('payment_ready', 'payment_auth_started', 'payment_failed') then
      v_target_order := v_order.status;
      v_target_payment := v_order.payment_status;
    else
      raise exception using errcode = 'P0001', message = 'invalid webhook state transition';
    end if;
  end if;

  -- Apply inventory side effects only after the final transition has been resolved.
  -- Replayed lower-state events must never release or consume stock accidentally.
  if v_status = 'DONE' and v_target_payment = 'done' then
    perform private.consume_order_inventory(v_order.id);
  elsif v_status = 'WAITING_FOR_DEPOSIT' and v_target_payment = 'waiting_for_deposit' then
    update public.inventory_reservations
    set expires_at = greatest(expires_at, coalesce(p_virtual_due_at, now() + interval '15 minutes')),
        updated_at = now()
    where order_id = v_order.id and status = 'reserved';
    update public.orders
    set reservation_expires_at = greatest(
      coalesce(reservation_expires_at, now()),
      coalesce(p_virtual_due_at, now() + interval '15 minutes')
    )
    where id = v_order.id;
  elsif v_status = 'CANCELED' and v_target_order = 'canceled'
        and v_order.status not in ('shipping_ready', 'shipped', 'delivered') then
    v_released := private.release_order_inventory(v_order.id, 'provider cancellation webhook', true, false);
  elsif v_status in ('ABORTED', 'EXPIRED')
        and v_target_order in ('payment_failed', 'canceled')
        and v_order.status not in ('paid', 'shipping_ready', 'shipped', 'delivered') then
    v_released := private.release_order_inventory(
      v_order.id,
      case when v_status = 'EXPIRED' then 'provider payment expired' else 'provider aborted payment' end,
      false,
      v_status = 'EXPIRED'
    );
  end if;

  if v_status in ('CANCELED', 'PARTIAL_CANCELED') then
    v_new_canceled_amount := greatest(v_payment.canceled_amount, v_new_canceled_amount);
    v_cancel_delta := v_new_canceled_amount - v_payment.canceled_amount;
  else
    v_new_canceled_amount := v_payment.canceled_amount;
  end if;
  v_refund_total := least(
    case
      when coalesce(v_payment.approved_amount, 0) > 0 then v_payment.approved_amount
      when p_approved_at is not null and v_status in ('CANCELED', 'PARTIAL_CANCELED') then p_amount
      else 0
    end,
    v_new_canceled_amount
  );
  v_refund_delta := greatest(0, v_refund_total - v_order.refund_amount);

  update public.payments
  set toss_payment_key = coalesce(toss_payment_key, p_payment_key),
      status = v_target_payment,
      approved_amount = case
        when v_status = 'DONE' then p_amount
        when v_status in ('CANCELED', 'PARTIAL_CANCELED') and p_approved_at is not null
          then greatest(coalesce(approved_amount, 0), p_amount)
        else approved_amount
      end,
      canceled_amount = v_new_canceled_amount,
      transaction_id = coalesce(nullif(left(coalesce(p_transaction_id, ''), 200), ''), transaction_id),
      approval_no = coalesce(nullif(left(coalesce(p_approval_no, ''), 100), ''), approval_no),
      approved_at = case
        when v_status = 'DONE' then coalesce(p_approved_at, approved_at, now())
        when v_status in ('CANCELED', 'PARTIAL_CANCELED') then coalesce(approved_at, p_approved_at)
        else approved_at
      end,
      canceled_at = case when v_status in ('CANCELED', 'PARTIAL_CANCELED') then now() else canceled_at end,
      webhook_secret_hash = case
        when p_webhook_secret_hash ~ '^[0-9a-f]{64}$' then p_webhook_secret_hash
        else webhook_secret_hash
      end,
      virtual_due_at = case
        when v_target_payment = 'waiting_for_deposit' then coalesce(p_virtual_due_at, virtual_due_at)
        else virtual_due_at
      end,
      next_reconcile_at = case
        when v_active_cancel and v_target_order = 'cancel_requested' then now() + interval '2 minutes'
        when v_blocking_cancel and v_target_order = 'cancel_requested' then null
        when v_target_payment = 'waiting_for_deposit' then now() + interval '15 minutes'
        when v_target_payment = 'in_progress' then now() + interval '2 minutes'
        else null
      end,
      reconcile_lease_until = null,
      reconcile_lease_token = null,
      last_reconcile_error = null,
      raw_response_json = coalesce(p_safe_payload, raw_response_json),
      updated_at = now()
  where id = v_payment.id;

  if v_refund_delta > 0 then
    insert into public.payment_refunds (
      payment_id, cancel_reason, cancel_amount, refund_status, requested_at, completed_at
    ) values (
      v_payment.id, 'provider webhook reconciliation', v_refund_delta,
      'completed', now(), now()
    );
  end if;

  update public.orders
  set status = v_target_order,
      payment_status = v_target_payment,
      refund_amount = greatest(refund_amount, v_refund_total),
      transaction_id = coalesce(nullif(left(coalesce(p_transaction_id, ''), 200), ''), transaction_id),
      approval_no = coalesce(nullif(left(coalesce(p_approval_no, ''), 100), ''), approval_no),
      updated_at = now()
  where id = v_order.id;

  if v_status = 'CANCELED'
     or (v_status in ('ABORTED', 'EXPIRED') and v_target_order = 'canceled') then
    update public.payment_attempts
    set status = 'succeeded',
        response_json = coalesce(p_safe_payload, response_json, '{}'::jsonb),
        sensitive_request_ciphertext = null,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown', 'manual_review');
  elsif v_status = 'PARTIAL_CANCELED' then
    update public.payment_attempts
    set status = case
          when coalesce((request_json ->> 'canceledAmountBefore')::integer, 0)
               + coalesce((request_json ->> 'cancelAmount')::integer, 0)
               <= v_new_canceled_amount
          then 'succeeded'
          else 'partially_succeeded'
        end,
        response_json = coalesce(p_safe_payload, response_json, '{}'::jsonb),
        sensitive_request_ciphertext = null,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown', 'manual_review')
      and v_new_canceled_amount > coalesce((request_json ->> 'canceledAmountBefore')::integer, 0);
  end if;

  if v_target_order = 'canceled'
     and v_status in ('CANCELED', 'ABORTED', 'EXPIRED') then
    update public.payment_attempts
    set status = 'superseded_by_cancellation',
        error_code = 'PAYMENT_CANCELED',
        response_json = coalesce(response_json, '{}'::jsonb)
          || jsonb_build_object('supersededBy', 'provider_cancellation'),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = v_order.id and operation = 'confirm'
      and status in ('started', 'in_progress', 'unknown');
  elsif v_status in ('DONE', 'WAITING_FOR_DEPOSIT', 'PARTIAL_CANCELED') then
    update public.payment_attempts
    set status = 'succeeded',
        response_json = coalesce(p_safe_payload, response_json, '{}'::jsonb),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = v_order.id and operation = 'confirm'
      and status in ('started', 'in_progress', 'unknown');
  elsif v_target_order = 'payment_failed' and v_status in ('ABORTED', 'EXPIRED') then
    update public.payment_attempts
    set status = 'failed',
        error_code = v_status,
        response_json = coalesce(p_safe_payload, response_json, '{}'::jsonb),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = v_order.id and operation = 'confirm'
      and status in ('started', 'in_progress', 'unknown');
  end if;

  select exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown')
  ) into v_pending_cancel;
  if v_pending_cancel then
    update public.payments
    set next_reconcile_at = now() + interval '2 minutes', updated_at = now()
    where id = v_payment.id;
  end if;

  update public.payment_events
  set processing_status = 'processed', processed_at = now(), last_error = null,
      payload_json = coalesce(p_safe_payload, payload_json), updated_at = now()
  where id = v_event.id;
  insert into public.order_events (order_id, event_type, from_status, to_status, payload_json)
  values (
    v_order.id, 'payment_webhook_' || lower(v_status), v_from_status, v_target_order,
    jsonb_build_object(
      'paymentEventId', v_event.id,
      'releasedQty', v_released,
      'cancelDelta', v_cancel_delta,
      'canceledAmount', v_new_canceled_amount,
      'refundDelta', v_refund_delta,
      'refundAmount', v_refund_total
    )
  );

  return private.order_payload(v_order.id) || jsonb_build_object('duplicate', false, 'releasedQty', v_released);
end;
$$;

create or replace function public.mark_payment_webhook_failed_v1(
  p_event_id uuid,
  p_error_code text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_events
  set processing_status = 'failed',
      last_error = left(coalesce(p_error_code, 'WEBHOOK_PROCESSING_FAILED'), 120),
      updated_at = now()
  where id = p_event_id and processing_status <> 'processed';
$$;

revoke all on function public.verify_payment_webhook_secret_v1(text, text) from public, anon, authenticated;
revoke all on function public.claim_payment_webhook_v1(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.apply_payment_webhook_v1(uuid, text, text, integer, integer, text, text, text, timestamptz, timestamptz, text, jsonb) from public, anon, authenticated;
revoke all on function public.mark_payment_webhook_failed_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_payment_webhook_secret_v1(text, text) to service_role;
grant execute on function public.claim_payment_webhook_v1(text, text, text, jsonb) to service_role;
grant execute on function public.apply_payment_webhook_v1(uuid, text, text, integer, integer, text, text, text, timestamptz, timestamptz, text, jsonb) to service_role;
grant execute on function public.mark_payment_webhook_failed_v1(uuid, text) to service_role;

-- Explicit grants make the migration independent of the project's Data API defaults.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.orders, public.order_items,
  public.order_item_snapshots, public.shipping_snapshots, public.payment_snapshots,
  public.payments, public.payment_attempts, public.payment_events, public.payment_refunds,
  public.product_variants, public.products, public.profiles, public.user_roles,
  public.inventory_reservations, public.order_events, public.commerce_settings,
  public.shipping_surcharge_zones to service_role;
