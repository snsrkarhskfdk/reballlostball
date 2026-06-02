create extension if not exists pgcrypto;

create schema if not exists private;

do $$
begin
  create type public.order_status as enum (
    'draft',
    'payment_ready',
    'payment_auth_started',
    'waiting_for_deposit',
    'paid',
    'payment_failed',
    'cancel_requested',
    'canceled',
    'partially_canceled',
    'refunded',
    'shipping_ready',
    'shipped',
    'delivered'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_status as enum (
    'ready',
    'in_progress',
    'waiting_for_deposit',
    'done',
    'canceled',
    'partial_canceled',
    'failed',
    'expired'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_provider as enum (
    'mock',
    'toss_payments',
    'naverpay_direct',
    'kakaopay_direct'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_method as enum (
    'card',
    'transfer',
    'virtual_account',
    'easy_pay'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.ball_grade as enum ('A_PLUS', 'A', 'B');
exception when duplicate_object then null;
end $$;

create table if not exists public.store_profile (
  id uuid primary key default gen_random_uuid(),
  brand_name_ko text not null default '리볼 로스트볼',
  brand_name_en text default 'Reball Lostball',
  representative_name text,
  business_number text,
  mail_order_number text,
  email text,
  phone text,
  cs_phone text,
  address_road text,
  hosting_provider text default 'Vercel',
  business_info_status text not null default 'TODO_OWNER_INPUT',
  updated_at timestamptz not null default now()
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  sort_order int not null default 100,
  active boolean not null default true
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id),
  slug text unique not null,
  name text not null,
  subtitle text,
  summary text,
  sale_type text not null default 'lostball',
  base_price_krw int not null,
  featured boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text unique not null,
  option_model text,
  option_color text,
  option_design text,
  grade public.ball_grade not null,
  pack_size int not null,
  price_krw int not null,
  compare_at_krw int,
  stock_qty int not null default 0,
  thumbnail_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  inbound_qty int not null,
  available_qty int not null,
  received_at timestamptz not null default now(),
  memo text
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer', 'cs_manager', 'inventory_manager', 'payments_manager', 'owner_admin')),
  name text,
  phone text,
  email text,
  provider text,
  marketing_email boolean not null default false,
  marketing_sms boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'cs_manager', 'inventory_manager', 'payments_manager', 'owner_admin')),
  primary key (user_id, role)
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  receiver_name text not null,
  receiver_phone text not null,
  zip_code text not null,
  road_address text not null,
  detail_address text,
  is_default boolean not null default false
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  order_no text unique not null,
  status public.order_status not null default 'draft',
  payment_status public.payment_status not null default 'ready',
  payment_provider public.payment_provider,
  payment_method public.payment_method,
  pg_provider text,
  transaction_id text,
  approval_no text,
  subtotal_krw int not null,
  shipping_krw int not null default 0,
  discount_krw int not null default 0,
  benefit_amount int not null default 0,
  refund_amount int not null default 0,
  total_krw int not null,
  address_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid not null references public.product_variants(id),
  product_name text not null,
  variant_name text not null,
  unit_price_krw int not null,
  qty int not null,
  line_total_krw int not null
);

create table if not exists public.order_item_snapshots (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  payload_json jsonb not null
);

create table if not exists public.shipping_snapshots (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  payload_json jsonb not null
);

create table if not exists public.payment_snapshots (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  payload_json jsonb not null
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider public.payment_provider not null default 'toss_payments',
  provider_order_id text,
  toss_payment_key text unique,
  toss_mid text,
  method public.payment_method,
  easy_pay_provider text,
  status public.payment_status not null default 'ready',
  requested_amount int not null,
  approved_amount int,
  canceled_amount int not null default 0,
  benefit_amount int not null default 0,
  is_general_pg_benefit_eligible boolean not null default false,
  transaction_id text,
  approval_no text,
  approved_at timestamptz,
  canceled_at timestamptz,
  raw_response_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  provider public.payment_provider not null,
  operation text not null,
  idempotency_key text unique,
  request_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  status text not null default 'started',
  created_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete cascade,
  provider public.payment_provider not null,
  event_type text not null,
  provider_event_id text,
  payload_json jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received',
  unique (provider, provider_event_id)
);

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  cancel_reason text not null,
  cancel_amount int not null,
  refund_status text not null default 'requested',
  requested_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.benefit_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  applies_to text not null,
  benefit_type text not null check (benefit_type in ('point', 'coupon', 'grade_credit', 'discount')),
  benefit_value int not null,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default false
);

create table if not exists public.benefit_applications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  benefit_policy_id uuid references public.benefit_policies(id) on delete set null,
  benefit_amount int not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  title text,
  body text not null,
  visible boolean not null default false,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text,
  href text,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  sort_order int not null default 100
);

create table if not exists public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  body_md text not null,
  effective_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  action text not null,
  table_name text not null,
  row_pk text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function private.has_role(_role text)
returns boolean
language sql
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role = _role
  );
$$;

revoke all on function private.has_role(text) from public;
grant execute on function private.has_role(text) to anon, authenticated;

alter table public.store_profile enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_snapshots enable row level security;
alter table public.shipping_snapshots enable row level security;
alter table public.payment_snapshots enable row level security;
alter table public.payments enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_events enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.benefit_policies enable row level security;
alter table public.benefit_applications enable row level security;
alter table public.reviews enable row level security;
alter table public.banners enable row level security;
alter table public.policy_versions enable row level security;
alter table public.admin_audit_logs enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.store_profile, public.brands, public.products, public.product_variants, public.banners, public.policy_versions to anon, authenticated;
grant select, insert, update on public.profiles, public.addresses, public.orders, public.order_items, public.reviews to authenticated;

create policy "store_profile_public_read" on public.store_profile
for select to anon, authenticated using (true);

create policy "brands_public_read" on public.brands
for select to anon, authenticated using (active = true);

create policy "products_public_read" on public.products
for select to anon, authenticated using (active = true);

create policy "variants_public_read" on public.product_variants
for select to anon, authenticated using (active = true);

create policy "banners_public_read" on public.banners
for select to anon, authenticated using (active = true);

create policy "policy_versions_public_read" on public.policy_versions
for select to anon, authenticated using (active = true);

create policy "profiles_self_select" on public.profiles
for select to authenticated using ((select auth.uid()) = id);

create policy "profiles_self_update" on public.profiles
for update to authenticated using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "addresses_self_all" on public.addresses
for all to authenticated using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

create policy "orders_self_select" on public.orders
for select to authenticated
using (
  (select auth.uid()) = profile_id
  or private.has_role('cs_manager')
  or private.has_role('payments_manager')
  or private.has_role('owner_admin')
);

create policy "orders_self_insert" on public.orders
for insert to authenticated
with check ((select auth.uid()) = profile_id);

create policy "order_items_self_select" on public.order_items
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

create policy "reviews_public_or_admin_read" on public.reviews
for select to anon, authenticated
using (visible = true or private.has_role('cs_manager') or private.has_role('owner_admin'));

create policy "reviews_customer_insert" on public.reviews
for insert to authenticated
with check (profile_id = (select auth.uid()) and is_sample = false);

create policy "admin_audit_admin_read" on public.admin_audit_logs
for select to authenticated using (private.has_role('owner_admin'));
