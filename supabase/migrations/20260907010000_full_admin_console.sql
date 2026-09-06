-- Full Reball admin console operational support.
-- Extends the existing store-manager without broadening high-risk payment authority.

-- Explicit low-stock thresholds make dashboard alerts configurable per SKU.
alter table public.product_variants
  add column if not exists low_stock_threshold integer not null default 5;
alter table public.product_variants
  drop constraint if exists product_variants_low_stock_threshold_check;
alter table public.product_variants
  add constraint product_variants_low_stock_threshold_check
  check (low_stock_threshold between 0 and 9999) not valid;

-- Customer-service requests can be created manually by staff for phone/email contacts,
-- while authenticated customers may create/read their own requests later.
create table if not exists public.customer_inquiries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid null references public.profiles(id) on delete set null,
  guest_name text null,
  guest_email text null,
  guest_phone text null,
  category text not null default 'general',
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open','replied','closed')),
  admin_reply text null,
  replied_by uuid null references auth.users(id) on delete set null,
  replied_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.customer_inquiries enable row level security;

drop policy if exists customer_inquiries_self_insert on public.customer_inquiries;
create policy customer_inquiries_self_insert on public.customer_inquiries
for insert to authenticated
with check (profile_id = auth.uid());

drop policy if exists customer_inquiries_self_select on public.customer_inquiries;
create policy customer_inquiries_self_select on public.customer_inquiries
for select to authenticated
using (
  profile_id = auth.uid()
  or private.has_role('cs_manager')
  or private.has_role('store_manager')
  or private.has_role('owner_admin')
);

drop policy if exists customer_inquiries_admin_insert on public.customer_inquiries;
create policy customer_inquiries_admin_insert on public.customer_inquiries
for insert to authenticated
with check (
  private.has_role('cs_manager')
  or private.has_role('store_manager')
  or private.has_role('owner_admin')
);

drop policy if exists customer_inquiries_admin_update on public.customer_inquiries;
create policy customer_inquiries_admin_update on public.customer_inquiries
for update to authenticated
using (
  private.has_role('cs_manager')
  or private.has_role('store_manager')
  or private.has_role('owner_admin')
)
with check (
  private.has_role('cs_manager')
  or private.has_role('store_manager')
  or private.has_role('owner_admin')
);

-- Post-payment return/exchange cases are tracked separately from Toss cancellation.
create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  request_type text not null check (request_type in ('cancel','return','exchange')),
  reason text not null,
  status text not null default 'requested' check (status in ('requested','approved','rejected','completed')),
  resolution_note text null,
  requested_by uuid null references auth.users(id) on delete set null,
  handled_by uuid null references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  handled_at timestamptz null,
  updated_at timestamptz not null default now()
);
create index if not exists return_requests_order_id_idx on public.return_requests(order_id);
alter table public.return_requests enable row level security;

drop policy if exists return_requests_admin_select on public.return_requests;
create policy return_requests_admin_select on public.return_requests
for select to authenticated
using (
  private.has_role('cs_manager')
  or private.has_role('store_manager')
  or private.has_role('payments_manager')
  or private.has_role('owner_admin')
  or exists (
    select 1 from public.orders o
    where o.id = return_requests.order_id and o.profile_id = auth.uid()
  )
);

drop policy if exists return_requests_admin_insert on public.return_requests;
create policy return_requests_admin_insert on public.return_requests
for insert to authenticated
with check (
  private.has_role('cs_manager')
  or private.has_role('store_manager')
  or private.has_role('payments_manager')
  or private.has_role('owner_admin')
  or exists (
    select 1 from public.orders o
    where o.id = return_requests.order_id and o.profile_id = auth.uid()
  )
);

drop policy if exists return_requests_admin_update on public.return_requests;
create policy return_requests_admin_update on public.return_requests
for update to authenticated
using (
  private.has_role('cs_manager')
  or private.has_role('store_manager')
  or private.has_role('payments_manager')
  or private.has_role('owner_admin')
)
with check (
  private.has_role('cs_manager')
  or private.has_role('store_manager')
  or private.has_role('payments_manager')
  or private.has_role('owner_admin')
);

-- POS registry is intentionally device/status management only. Payment settlement
-- authority remains in the payment system.
create table if not exists public.pos_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text null,
  status text not null default 'offline' check (status in ('online','offline','maintenance')),
  note text null,
  last_seen_at timestamptz null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pos_devices enable row level security;

drop policy if exists pos_devices_ops_select on public.pos_devices;
create policy pos_devices_ops_select on public.pos_devices
for select to authenticated
using (private.has_role('store_manager') or private.has_role('owner_admin'));

drop policy if exists pos_devices_ops_insert on public.pos_devices;
create policy pos_devices_ops_insert on public.pos_devices
for insert to authenticated
with check (private.has_role('store_manager') or private.has_role('owner_admin'));

drop policy if exists pos_devices_ops_update on public.pos_devices;
create policy pos_devices_ops_update on public.pos_devices
for update to authenticated
using (private.has_role('store_manager') or private.has_role('owner_admin'))
with check (private.has_role('store_manager') or private.has_role('owner_admin'));

-- Owner/CS content operations.
drop policy if exists reviews_admin_update on public.reviews;
create policy reviews_admin_update on public.reviews
for update to authenticated
using (private.has_role('cs_manager') or private.has_role('owner_admin'))
with check (private.has_role('cs_manager') or private.has_role('owner_admin'));

drop policy if exists banners_admin_select on public.banners;
create policy banners_admin_select on public.banners
for select to authenticated
using (private.has_role('owner_admin'));
drop policy if exists banners_admin_insert on public.banners;
create policy banners_admin_insert on public.banners
for insert to authenticated with check (private.has_role('owner_admin'));
drop policy if exists banners_admin_update on public.banners;
create policy banners_admin_update on public.banners
for update to authenticated
using (private.has_role('owner_admin')) with check (private.has_role('owner_admin'));
drop policy if exists banners_admin_delete on public.banners;
create policy banners_admin_delete on public.banners
for delete to authenticated using (private.has_role('owner_admin'));

drop policy if exists store_profile_owner_insert on public.store_profile;
create policy store_profile_owner_insert on public.store_profile
for insert to authenticated with check (private.has_role('owner_admin'));
drop policy if exists store_profile_owner_update on public.store_profile;
create policy store_profile_owner_update on public.store_profile
for update to authenticated
using (private.has_role('owner_admin')) with check (private.has_role('owner_admin'));

drop policy if exists commerce_settings_owner_insert on public.commerce_settings;
create policy commerce_settings_owner_insert on public.commerce_settings
for insert to authenticated with check (private.has_role('owner_admin'));
drop policy if exists commerce_settings_owner_update on public.commerce_settings;
create policy commerce_settings_owner_update on public.commerce_settings
for update to authenticated
using (private.has_role('owner_admin')) with check (private.has_role('owner_admin'));

insert into public.commerce_settings (
  singleton, base_shipping_krw, free_shipping_threshold_krw,
  remote_area_surcharge_krw, reservation_ttl_minutes, guest_lookup_ttl_days
) values (true, 3500, 50000, 2000, 40, 365)
on conflict (singleton) do nothing;

-- Owner can manage legal policy versions in the DB; activation remains explicit.
drop policy if exists policy_versions_owner_select on public.policy_versions;
create policy policy_versions_owner_select on public.policy_versions
for select to authenticated using (private.has_role('owner_admin'));
drop policy if exists policy_versions_owner_insert on public.policy_versions;
create policy policy_versions_owner_insert on public.policy_versions
for insert to authenticated with check (private.has_role('owner_admin'));
drop policy if exists policy_versions_owner_update on public.policy_versions;
create policy policy_versions_owner_update on public.policy_versions
for update to authenticated
using (private.has_role('owner_admin')) with check (private.has_role('owner_admin'));

-- Owner-only role mutation, called from a server Edge Function.
create or replace function public.admin_set_user_roles_v1(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_roles text[]
)
returns text[]
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_allowed constant text[] := array['customer','cs_manager','inventory_manager','payments_manager','store_manager','owner_admin'];
  v_roles text[];
  v_role text;
begin
  if p_actor_user_id is null or not private.user_has_role(p_actor_user_id, 'owner_admin') then
    raise exception using errcode='42501', message='owner admin required';
  end if;
  if p_target_user_id is null or not exists (select 1 from auth.users u where u.id = p_target_user_id) then
    raise exception using errcode='22023', message='target user not found';
  end if;
  select coalesce(array_agg(distinct x order by x), array[]::text[])
    into v_roles from unnest(coalesce(p_roles, array[]::text[])) x;
  foreach v_role in array v_roles loop
    if not (v_role = any(v_allowed)) then
      raise exception using errcode='22023', message='invalid role';
    end if;
  end loop;
  if p_actor_user_id = p_target_user_id and not ('owner_admin' = any(v_roles)) then
    raise exception using errcode='42501', message='cannot remove own owner role';
  end if;
  delete from public.user_roles where user_id = p_target_user_id;
  if not ('customer' = any(v_roles)) then
    v_roles := array_append(v_roles, 'customer');
  end if;
  insert into public.user_roles(user_id, role)
  select p_target_user_id, x from unnest(v_roles) x
  on conflict do nothing;
  return v_roles;
end;
$function$;
revoke all on function public.admin_set_user_roles_v1(uuid,uuid,text[]) from public, anon, authenticated;
grant execute on function public.admin_set_user_roles_v1(uuid,uuid,text[]) to service_role;

-- Lightweight audit trail for browser-side admin changes. Shipping/payment changes
-- already have order_events/payment_attempts and are intentionally not duplicated here.
create or replace function private.audit_admin_change_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_pk text;
begin
  v_pk := coalesce(
    v_new->>'id', v_old->>'id',
    v_new->>'user_id', v_old->>'user_id',
    v_new->>'singleton', v_old->>'singleton',
    v_new->>'slug', v_old->>'slug',
    'unknown'
  );
  insert into public.admin_audit_logs(actor_user_id, action, table_name, row_pk, old_data, new_data)
  values (auth.uid(), lower(tg_op), tg_table_name, v_pk, v_old, v_new);
  return coalesce(new, old);
end;
$function$;

-- Attach only to admin-operated tables; do not audit orders/payments because they
-- contain customer/payment payloads and already have dedicated event ledgers.
do $block$
declare
  v_table text;
begin
  foreach v_table in array array[
    'products','product_variants','reviews','banners','benefit_policies',
    'store_profile','commerce_settings','user_roles','customer_inquiries',
    'return_requests','pos_devices','policy_versions'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || v_table || '_admin_change', v_table);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_admin_change_v1()',
      'audit_' || v_table || '_admin_change', v_table
    );
  end loop;
end;
$block$;
