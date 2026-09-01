-- Limit the mobile payment-return recovery capability to the checkout window.
-- The browser-facing HMAC is payment-scoped, but stale browser history should
-- not remain useful as an authorization bridge long after checkout.

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
     or v_order.created_at < now() - interval '2 hours'
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
