-- Cover foreign keys used by commerce cleanup, audit, and webhook lookups.

create index if not exists inventory_reservations_variant_id_idx
  on public.inventory_reservations (variant_id);

create index if not exists order_events_actor_user_id_idx
  on public.order_events (actor_user_id);

create index if not exists payment_events_order_id_idx
  on public.payment_events (order_id);
