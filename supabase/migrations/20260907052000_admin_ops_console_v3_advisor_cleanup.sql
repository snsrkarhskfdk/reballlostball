-- Close only the performance advisor findings introduced by the V3 admin tables.
create index if not exists customer_inquiries_replied_by_idx
  on public.customer_inquiries(replied_by);
create index if not exists return_requests_handled_by_idx
  on public.return_requests(handled_by);

drop policy if exists customer_inquiries_self_select on public.customer_inquiries;
create policy customer_inquiries_self_select on public.customer_inquiries
for select to authenticated
using (
  profile_id = (select auth.uid())
  or (select private.has_role('cs_manager'))
  or (select private.has_role('store_manager'))
  or (select private.has_role('owner_admin'))
);

drop policy if exists customer_inquiries_self_insert on public.customer_inquiries;
create policy customer_inquiries_self_insert on public.customer_inquiries
for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and status = 'open'
  and admin_reply is null
  and replied_by is null
  and replied_at is null
);

drop policy if exists return_requests_self_or_admin_select on public.return_requests;
create policy return_requests_self_or_admin_select on public.return_requests
for select to authenticated
using (
  (select private.has_role('cs_manager'))
  or (select private.has_role('store_manager'))
  or (select private.has_role('payments_manager'))
  or (select private.has_role('owner_admin'))
  or exists (
    select 1 from public.orders o
    where o.id = return_requests.order_id
      and o.profile_id = (select auth.uid())
  )
);

drop policy if exists return_requests_self_insert on public.return_requests;
create policy return_requests_self_insert on public.return_requests
for insert to authenticated
with check (
  requested_by = (select auth.uid())
  and status = 'requested'
  and resolution_note is null
  and handled_by is null
  and handled_at is null
  and exists (
    select 1 from public.orders o
    where o.id = return_requests.order_id
      and o.profile_id = (select auth.uid())
  )
);
