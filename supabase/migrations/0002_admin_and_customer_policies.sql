create policy "user_roles_self_select" on public.user_roles
for select to authenticated
using ((select auth.uid()) = user_id or private.has_role('owner_admin'));

create policy "user_roles_owner_admin_all" on public.user_roles
for all to authenticated
using (private.has_role('owner_admin'))
with check (private.has_role('owner_admin'));

create policy "inventory_lots_admin_all" on public.inventory_lots
for all to authenticated
using (
  private.has_role('inventory_manager')
  or private.has_role('owner_admin')
)
with check (
  private.has_role('inventory_manager')
  or private.has_role('owner_admin')
);

create policy "benefit_policies_public_active_read" on public.benefit_policies
for select to anon, authenticated
using (is_active = true);

create policy "benefit_policies_admin_all" on public.benefit_policies
for all to authenticated
using (private.has_role('payments_manager') or private.has_role('owner_admin'))
with check (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "benefit_applications_self_select" on public.benefit_applications
for select to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = benefit_applications.order_id
      and orders.profile_id = (select auth.uid())
  )
  or private.has_role('payments_manager')
  or private.has_role('owner_admin')
);

create policy "benefit_applications_admin_all" on public.benefit_applications
for all to authenticated
using (private.has_role('payments_manager') or private.has_role('owner_admin'))
with check (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "order_item_snapshots_self_select" on public.order_item_snapshots
for select to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = order_item_snapshots.order_id
      and orders.profile_id = (select auth.uid())
  )
  or private.has_role('cs_manager')
  or private.has_role('owner_admin')
);

create policy "shipping_snapshots_self_select" on public.shipping_snapshots
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

create policy "payment_snapshots_self_select" on public.payment_snapshots
for select to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = payment_snapshots.order_id
      and orders.profile_id = (select auth.uid())
  )
  or private.has_role('payments_manager')
  or private.has_role('owner_admin')
);

create policy "payments_self_select" on public.payments
for select to authenticated
using (
  exists (
    select 1 from public.orders
    where orders.id = payments.order_id
      and orders.profile_id = (select auth.uid())
  )
  or private.has_role('payments_manager')
  or private.has_role('owner_admin')
);

create policy "payments_admin_all" on public.payments
for all to authenticated
using (private.has_role('payments_manager') or private.has_role('owner_admin'))
with check (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "payment_attempts_admin_all" on public.payment_attempts
for all to authenticated
using (private.has_role('payments_manager') or private.has_role('owner_admin'))
with check (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "payment_events_admin_all" on public.payment_events
for all to authenticated
using (private.has_role('payments_manager') or private.has_role('owner_admin'))
with check (private.has_role('payments_manager') or private.has_role('owner_admin'));

create policy "payment_refunds_self_select" on public.payment_refunds
for select to authenticated
using (
  exists (
    select 1
    from public.payments
    join public.orders on orders.id = payments.order_id
    where payments.id = payment_refunds.payment_id
      and orders.profile_id = (select auth.uid())
  )
  or private.has_role('payments_manager')
  or private.has_role('owner_admin')
);

create policy "payment_refunds_admin_all" on public.payment_refunds
for all to authenticated
using (private.has_role('payments_manager') or private.has_role('owner_admin'))
with check (private.has_role('payments_manager') or private.has_role('owner_admin'));
