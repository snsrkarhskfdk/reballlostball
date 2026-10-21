-- Return the latest N admin notes independently for each requested order.
-- The function is service-only because order notes may contain operational PII.
create or replace function public.admin_order_notes_page_v1(
  p_order_ids uuid[],
  p_limit_per_order integer default 5
)
returns table (
  order_id uuid,
  event_type text,
  payload_json jsonb,
  actor_user_id uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with ranked as (
    select
      e.order_id,
      e.event_type,
      e.payload_json,
      e.actor_user_id,
      e.created_at,
      row_number() over (
        partition by e.order_id
        order by e.created_at desc, e.id desc
      ) as rn
    from public.order_events e
    where e.event_type = 'admin_note'
      and e.order_id = any(coalesce(p_order_ids, '{}'::uuid[]))
  )
  select
    ranked.order_id,
    ranked.event_type,
    ranked.payload_json,
    ranked.actor_user_id,
    ranked.created_at
  from ranked
  where ranked.rn <= greatest(1, least(coalesce(p_limit_per_order, 5), 20))
  order by ranked.created_at desc;
$$;

revoke all on function public.admin_order_notes_page_v1(uuid[], integer) from public;
revoke all on function public.admin_order_notes_page_v1(uuid[], integer) from anon;
revoke all on function public.admin_order_notes_page_v1(uuid[], integer) from authenticated;
grant execute on function public.admin_order_notes_page_v1(uuid[], integer) to service_role;
