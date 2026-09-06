-- Prevent a signed-in customer from spoofing admin-managed state when creating
-- their own inquiry or return request. Admin writes remain service-mediated.

drop policy if exists customer_inquiries_self_insert on public.customer_inquiries;
create policy customer_inquiries_self_insert on public.customer_inquiries
for insert to authenticated
with check (
  profile_id = auth.uid()
  and status = 'open'
  and admin_reply is null
  and replied_by is null
  and replied_at is null
);

drop policy if exists return_requests_self_insert on public.return_requests;
create policy return_requests_self_insert on public.return_requests
for insert to authenticated
with check (
  requested_by = auth.uid()
  and status = 'requested'
  and resolution_note is null
  and handled_by is null
  and handled_at is null
  and exists (
    select 1 from public.orders o
    where o.id = return_requests.order_id
      and o.profile_id = auth.uid()
  )
);

create index if not exists customer_inquiries_profile_created_idx
  on public.customer_inquiries(profile_id, created_at desc);
create index if not exists return_requests_requested_by_idx
  on public.return_requests(requested_by, requested_at desc);
