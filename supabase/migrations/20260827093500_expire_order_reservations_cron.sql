-- Automatically release expired payment reservations even when no new order arrives.
-- Supabase Cron is backed by pg_cron; scheduling the same job name replaces it.
create extension if not exists pg_cron;

select cron.schedule(
  'reball-expire-order-reservations',
  '*/5 * * * *',
  'select public.expire_order_reservations_v1(100)'
);
