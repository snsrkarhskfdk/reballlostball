-- Support the server-authoritative admin/customer pagination paths added by the
-- release closure. PostgreSQL can scan btree indexes backward, but explicit DESC
-- documents and optimizes the dominant newest-first access pattern.
create index if not exists orders_created_at_desc_idx
  on public.orders (created_at desc);

create index if not exists orders_status_created_at_desc_idx
  on public.orders (status, created_at desc);

create index if not exists orders_profile_created_at_desc_idx
  on public.orders (profile_id, created_at desc)
  where profile_id is not null;
