-- ASTRA-P2-4, second half. The Edge gate in payment-confirm was widened to every
-- settled order state, but this RPC is the actual authority and still refused any
-- status past 'paid'/'waiting_for_deposit', so that change was a no-op for exactly
-- the scenario it targeted: a guest replaying a lost confirmation after an
-- administrator advanced fulfilment received no rotated token, dropped their last
-- credential, and 404'd on the next order reload.
--
-- Widen the status check to match SETTLED_ORDER_STATUSES in payment-confirm. The
-- guest-only, toss-only, advisory-locked and hash-format guards are unchanged, and
-- canceled/partially_canceled/refunded remain excluded.
create or replace function public.rotate_guest_lookup_token_after_payment_v2(
  p_order_no text,
  p_new_guest_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
begin
  if coalesce(p_new_guest_token_hash, '') !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('guest-token-rotate:' || upper(btrim(p_order_no)), 0));

  select * into v_order
  from public.orders
  where order_no = upper(btrim(p_order_no))
  for update;

  if not found
     or v_order.profile_id is not null
     or v_order.payment_provider <> 'toss_payments'
     or v_order.status not in ('paid', 'waiting_for_deposit', 'shipping_ready', 'shipped', 'delivered') then
    return false;
  end if;

  if v_order.guest_lookup_token_hash = p_new_guest_token_hash then
    return true;
  end if;

  update public.orders
  set guest_lookup_token_hash = p_new_guest_token_hash,
      updated_at = now()
  where id = v_order.id;

  insert into public.order_events (
    order_id, event_type, from_status, to_status, payload_json
  ) values (
    v_order.id,
    'guest_lookup_token_rotated_after_payment',
    v_order.status,
    v_order.status,
    jsonb_build_object('reason', 'mobile_payment_return_recovery')
  );

  return true;
end;
$function$;
