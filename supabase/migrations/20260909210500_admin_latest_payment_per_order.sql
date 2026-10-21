-- Return exactly the newest payment row for each requested order.
-- This avoids a global LIMIT causing one noisy order to hide another order's
-- payment and prevents descending results from being overwritten by older rows
-- in the Edge Function's order_id map.
create or replace function public.admin_order_latest_payments_v1(
  p_order_ids uuid[]
)
returns table (
  order_id uuid,
  provider public.payment_provider,
  method public.payment_method,
  status public.payment_status,
  requested_amount integer,
  approved_amount integer,
  canceled_amount integer,
  approved_at timestamptz,
  canceled_at timestamptz,
  reconcile_attempts integer,
  last_reconcile_error text,
  transaction_id text,
  approval_no text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with ranked as (
    select
      p.order_id,
      p.provider,
      p.method,
      p.status,
      p.requested_amount,
      p.approved_amount,
      p.canceled_amount,
      p.approved_at,
      p.canceled_at,
      p.reconcile_attempts,
      p.last_reconcile_error,
      p.transaction_id,
      p.approval_no,
      row_number() over (
        partition by p.order_id
        order by p.created_at desc, p.id desc
      ) as rn
    from public.payments p
    where p.order_id = any(coalesce(p_order_ids, '{}'::uuid[]))
  )
  select
    ranked.order_id,
    ranked.provider,
    ranked.method,
    ranked.status,
    ranked.requested_amount,
    ranked.approved_amount,
    ranked.canceled_amount,
    ranked.approved_at,
    ranked.canceled_at,
    ranked.reconcile_attempts,
    ranked.last_reconcile_error,
    ranked.transaction_id,
    ranked.approval_no
  from ranked
  where ranked.rn = 1;
$$;

revoke all on function public.admin_order_latest_payments_v1(uuid[]) from public;
revoke all on function public.admin_order_latest_payments_v1(uuid[]) from anon;
revoke all on function public.admin_order_latest_payments_v1(uuid[]) from authenticated;
grant execute on function public.admin_order_latest_payments_v1(uuid[]) to service_role;
