alter table public.products
  add column if not exists detail_image_url text;

grant select, insert, update on public.brands, public.products, public.product_variants to authenticated;

drop policy if exists "brands_admin_select" on public.brands;
create policy "brands_admin_select" on public.brands
for select to authenticated
using (
  active = true
  or private.has_role('inventory_manager')
  or private.has_role('owner_admin')
);

drop policy if exists "brands_admin_insert" on public.brands;
create policy "brands_admin_insert" on public.brands
for insert to authenticated
with check (
  private.has_role('inventory_manager')
  or private.has_role('owner_admin')
);

drop policy if exists "brands_admin_update" on public.brands;
create policy "brands_admin_update" on public.brands
for update to authenticated
using (
  private.has_role('inventory_manager')
  or private.has_role('owner_admin')
)
with check (
  private.has_role('inventory_manager')
  or private.has_role('owner_admin')
);

drop policy if exists "products_admin_select" on public.products;
create policy "products_admin_select" on public.products
for select to authenticated
using (
  active = true
  or private.has_role('inventory_manager')
  or private.has_role('owner_admin')
);

drop policy if exists "products_admin_insert" on public.products;
create policy "products_admin_insert" on public.products
for insert to authenticated
with check (
  private.has_role('inventory_manager')
  or private.has_role('owner_admin')
);

drop policy if exists "products_admin_update" on public.products;
create policy "products_admin_update" on public.products
for update to authenticated
using (
  private.has_role('inventory_manager')
  or private.has_role('owner_admin')
)
with check (
  private.has_role('inventory_manager')
  or private.has_role('owner_admin')
);

drop policy if exists "product_variants_admin_select" on public.product_variants;
create policy "product_variants_admin_select" on public.product_variants
for select to authenticated
using (
  active = true
  or private.has_role('inventory_manager')
  or private.has_role('owner_admin')
);

drop policy if exists "product_variants_admin_insert" on public.product_variants;
create policy "product_variants_admin_insert" on public.product_variants
for insert to authenticated
with check (
  private.has_role('inventory_manager')
  or private.has_role('owner_admin')
);

drop policy if exists "product_variants_admin_update" on public.product_variants;
create policy "product_variants_admin_update" on public.product_variants
for update to authenticated
using (
  private.has_role('inventory_manager')
  or private.has_role('owner_admin')
)
with check (
  private.has_role('inventory_manager')
  or private.has_role('owner_admin')
);
