-- Store-manager role for day-to-day catalog media, price/stock/status, and shipping operations.

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role = any (array[
    'customer'::text,
    'cs_manager'::text,
    'inventory_manager'::text,
    'payments_manager'::text,
    'store_manager'::text,
    'owner_admin'::text
  ]));

-- Product access is intentionally limited to read/update. New catalog structure remains owner/inventory managed.
drop policy if exists products_store_manager_select on public.products;
create policy products_store_manager_select on public.products
for select to authenticated
using (private.has_role('store_manager'::text));

drop policy if exists products_store_manager_update on public.products;
create policy products_store_manager_update on public.products
for update to authenticated
using (private.has_role('store_manager'::text))
with check (private.has_role('store_manager'::text));

drop policy if exists product_variants_store_manager_select on public.product_variants;
create policy product_variants_store_manager_select on public.product_variants
for select to authenticated
using (private.has_role('store_manager'::text));

drop policy if exists product_variants_store_manager_update on public.product_variants;
create policy product_variants_store_manager_update on public.product_variants
for update to authenticated
using (private.has_role('store_manager'::text))
with check (private.has_role('store_manager'::text));

-- RLS decides which rows may be touched. These triggers additionally pin which columns
-- a store_manager-only actor may change, so browser devtools cannot widen the UI scope.
create or replace function private.guard_store_manager_product_update_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if private.has_role('store_manager'::text)
     and not private.has_role('owner_admin'::text)
     and not private.has_role('inventory_manager'::text) then
    if new.id is distinct from old.id
       or new.brand_id is distinct from old.brand_id
       or new.slug is distinct from old.slug
       or new.name is distinct from old.name
       or new.subtitle is distinct from old.subtitle
       or new.summary is distinct from old.summary
       or new.sale_type is distinct from old.sale_type
       or new.featured is distinct from old.featured
       or new.created_at is distinct from old.created_at then
      raise exception using errcode = '42501', message = 'store manager product field denied';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.guard_store_manager_variant_update_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if private.has_role('store_manager'::text)
     and not private.has_role('owner_admin'::text)
     and not private.has_role('inventory_manager'::text) then
    if new.id is distinct from old.id
       or new.product_id is distinct from old.product_id
       or new.sku is distinct from old.sku
       or new.option_model is distinct from old.option_model
       or new.option_color is distinct from old.option_color
       or new.option_design is distinct from old.option_design
       or new.grade is distinct from old.grade
       or new.pack_size is distinct from old.pack_size
       or new.compare_at_krw is distinct from old.compare_at_krw
       or new.created_at is distinct from old.created_at then
      raise exception using errcode = '42501', message = 'store manager variant field denied';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists products_store_manager_field_guard on public.products;
create trigger products_store_manager_field_guard
before update on public.products
for each row execute function private.guard_store_manager_product_update_v1();

drop trigger if exists product_variants_store_manager_field_guard on public.product_variants;
create trigger product_variants_store_manager_field_guard
before update on public.product_variants
for each row execute function private.guard_store_manager_variant_update_v1();

-- Store managers can read fulfillment data, but no direct order mutation is granted.
drop policy if exists orders_store_manager_select on public.orders;
create policy orders_store_manager_select on public.orders
for select to authenticated
using (private.has_role('store_manager'::text));

drop policy if exists order_items_store_manager_select on public.order_items;
create policy order_items_store_manager_select on public.order_items
for select to authenticated
using (private.has_role('store_manager'::text));

-- Public product media bucket. Writes are role-gated and use unique object names from the manager UI.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reball-product-media',
  'reball-product-media',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp','image/avif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    updated_at = now();

drop policy if exists reball_product_media_manager_insert on storage.objects;
create policy reball_product_media_manager_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'reball-product-media'
  and (
    private.has_role('store_manager'::text)
    or private.has_role('inventory_manager'::text)
    or private.has_role('owner_admin'::text)
  )
);

drop policy if exists reball_product_media_manager_select on storage.objects;
create policy reball_product_media_manager_select on storage.objects
for select to authenticated
using (
  bucket_id = 'reball-product-media'
  and (
    private.has_role('store_manager'::text)
    or private.has_role('inventory_manager'::text)
    or private.has_role('owner_admin'::text)
  )
);

-- Shipping remains server-mediated through admin-shipping. This RPC stays service-role only.
create or replace function public.admin_update_shipping_v1(
  p_actor_user_id uuid,
  p_order_id uuid,
  p_target_status public.order_status,
  p_shipping_carrier text default null,
  p_tracking_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders%rowtype;
  v_carrier text := nullif(btrim(coalesce(p_shipping_carrier, '')), '');
  v_tracking text := nullif(btrim(coalesce(p_tracking_number, '')), '');
begin
  if p_actor_user_id is null or not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_actor_user_id
      and ur.role in ('owner_admin','cs_manager','store_manager')
  ) then
    raise exception using errcode = '42501', message = 'admin role required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'order not found';
  end if;

  if p_target_status not in ('shipping_ready','shipped','delivered') then
    raise exception using errcode = '22023', message = 'invalid shipping status';
  end if;

  if p_target_status = 'shipping_ready' then
    if v_order.status not in ('paid','shipping_ready') then
      raise exception using errcode = '22023', message = 'order is not ready for shipping';
    end if;
    update public.orders
    set status = 'shipping_ready', updated_at = now()
    where id = p_order_id;
  elsif p_target_status = 'shipped' then
    if v_order.status not in ('paid','shipping_ready','shipped') then
      raise exception using errcode = '22023', message = 'order cannot be shipped';
    end if;
    if v_carrier is null or length(v_carrier) > 40 or v_tracking is null
       or length(v_tracking) not between 4 and 80 or v_tracking !~ '^[A-Za-z0-9-]+$' then
      raise exception using errcode = '22023', message = 'carrier and tracking number are required';
    end if;
    update public.orders
    set status = 'shipped',
        shipping_carrier = v_carrier,
        tracking_number = v_tracking,
        shipped_at = coalesce(shipped_at, now()),
        updated_at = now()
    where id = p_order_id;
  else
    if v_order.status not in ('shipped','delivered') then
      raise exception using errcode = '22023', message = 'order must be shipped before delivery';
    end if;
    update public.orders
    set status = 'delivered',
        delivered_at = coalesce(delivered_at, now()),
        updated_at = now()
    where id = p_order_id;
  end if;

  insert into public.order_events (
    order_id, actor_user_id, event_type, from_status, to_status, payload_json
  ) values (
    p_order_id,
    p_actor_user_id,
    'shipping_status_updated',
    v_order.status,
    p_target_status,
    jsonb_build_object('carrier', v_carrier, 'trackingNumber', v_tracking)
  );

  return private.order_payload(p_order_id);
end;
$function$;

revoke all on function public.admin_update_shipping_v1(uuid,uuid,public.order_status,text,text) from public, anon, authenticated;
grant execute on function public.admin_update_shipping_v1(uuid,uuid,public.order_status,text,text) to service_role;
