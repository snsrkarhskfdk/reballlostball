-- After an external mobile card-app round trip the browser may lose the original
-- guest lookup token. payment-confirm can authenticate with the scoped payment
-- return capability, then rotate a new canonical guest lookup token so ordinary
-- order refresh/lookup works again after the payment succeeds.

create or replace function public.payment_return_guest_hash_v2(p_order_no text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order
  from public.orders
  where order_no = upper(btrim(p_order_no));

  if not found
     or v_order.profile_id is not null
     or v_order.guest_lookup_token_hash is null
     or v_order.payment_provider <> 'toss_payments'
     or (v_order.guest_lookup_expires_at is not null and v_order.guest_lookup_expires_at <= now()) then
    return null;
  end if;

  return v_order.guest_lookup_token_hash;
end;
$function$;

revoke all on function public.payment_return_guest_hash_v2(text)
  from public, anon, authenticated;
grant execute on function public.payment_return_guest_hash_v2(text)
  to service_role;

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
     or v_order.status not in ('paid', 'waiting_for_deposit') then
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

revoke all on function public.rotate_guest_lookup_token_after_payment_v2(text, text)
  from public, anon, authenticated;
grant execute on function public.rotate_guest_lookup_token_after_payment_v2(text, text)
  to service_role;
