create index if not exists addresses_profile_id_idx on public.addresses(profile_id);
create index if not exists benefit_applications_benefit_policy_id_idx on public.benefit_applications(benefit_policy_id);
create index if not exists benefit_applications_order_id_idx on public.benefit_applications(order_id);
create index if not exists benefit_applications_payment_id_idx on public.benefit_applications(payment_id);
create index if not exists inventory_lots_variant_id_idx on public.inventory_lots(variant_id);
create index if not exists order_item_snapshots_order_id_idx on public.order_item_snapshots(order_id);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists order_items_variant_id_idx on public.order_items(variant_id);
create index if not exists orders_profile_id_idx on public.orders(profile_id);
create index if not exists payment_attempts_order_id_idx on public.payment_attempts(order_id);
create index if not exists payment_events_payment_id_idx on public.payment_events(payment_id);
create index if not exists payment_refunds_payment_id_idx on public.payment_refunds(payment_id);
create index if not exists payment_refunds_requested_by_idx on public.payment_refunds(requested_by);
create index if not exists payment_snapshots_order_id_idx on public.payment_snapshots(order_id);
create index if not exists payments_order_id_idx on public.payments(order_id);
create index if not exists product_variants_product_id_idx on public.product_variants(product_id);
create index if not exists products_brand_id_idx on public.products(brand_id);
create index if not exists reviews_product_id_idx on public.reviews(product_id);
create index if not exists reviews_profile_id_idx on public.reviews(profile_id);
create index if not exists shipping_snapshots_order_id_idx on public.shipping_snapshots(order_id);

drop policy if exists user_roles_owner_admin_all on public.user_roles;
drop policy if exists benefit_policies_public_active_read on public.benefit_policies;
drop policy if exists benefit_policies_admin_all on public.benefit_policies;
drop policy if exists benefit_applications_admin_all on public.benefit_applications;
drop policy if exists payments_admin_all on public.payments;
drop policy if exists payment_refunds_admin_all on public.payment_refunds;

create policy "benefit_policies_public_or_admin_select" on public.benefit_policies
for select to anon, authenticated
using (
  is_active = true
  or private.has_role('payments_manager')
  or private.has_role('owner_admin')
);

create policy "user_roles_owner_admin_insert" on public.user_roles
for insert to authenticated
with check (private.has_role('owner_admin'));

create policy "user_roles_owner_admin_update" on public.user_roles
for update to authenticated
using (private.has_role('owner_admin'))
with check (private.has_role('owner_admin'));

create policy "user_roles_owner_admin_delete" on public.user_roles
for delete to authenticated
using (private.has_role('owner_admin'));

create policy "benefit_policies_admin_insert" on public.benefit_policies
for insert to authenticated
with check (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "benefit_policies_admin_update" on public.benefit_policies
for update to authenticated
using (private.has_role('payments_manager') or private.has_role('owner_admin'))
with check (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "benefit_policies_admin_delete" on public.benefit_policies
for delete to authenticated
using (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "benefit_applications_admin_insert" on public.benefit_applications
for insert to authenticated
with check (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "benefit_applications_admin_update" on public.benefit_applications
for update to authenticated
using (private.has_role('payments_manager') or private.has_role('owner_admin'))
with check (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "benefit_applications_admin_delete" on public.benefit_applications
for delete to authenticated
using (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "payments_admin_insert" on public.payments
for insert to authenticated
with check (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "payments_admin_update" on public.payments
for update to authenticated
using (private.has_role('payments_manager') or private.has_role('owner_admin'))
with check (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "payments_admin_delete" on public.payments
for delete to authenticated
using (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "payment_refunds_admin_insert" on public.payment_refunds
for insert to authenticated
with check (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "payment_refunds_admin_update" on public.payment_refunds
for update to authenticated
using (private.has_role('payments_manager') or private.has_role('owner_admin'))
with check (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "payment_refunds_admin_delete" on public.payment_refunds
for delete to authenticated
using (private.has_role('payments_manager') or private.has_role('owner_admin'));
