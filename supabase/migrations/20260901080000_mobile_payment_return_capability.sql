-- Mobile Toss/card-app round trips can return in a fresh browser context where
-- sessionStorage is no longer available. Do not put the guest order lookup token
-- in the return URL. Instead derive a separate, order-scoped payment capability
-- from the stored guest-token hash and resolve it only inside service-role Edge
-- Functions. This capability cannot be used by browser roles or guest lookup APIs.

create or replace function public.resolve_payment_return_capability_v1(
  p_order_no text,
  p_return_token text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_expected text;
begin
  if coalesce(p_return_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select * into v_order
  from public.orders
  where order_no = upper(btrim(p_order_no));

  if not found
     or v_order.profile_id is not null
     or v_order.guest_lookup_token_hash is null
     or v_order.payment_provider <> 'toss_payments' then
    return null;
  end if;

  if v_order.guest_lookup_expires_at is not null
     and v_order.guest_lookup_expires_at <= now() then
    return null;
  end if;

  v_expected := encode(
    extensions.digest(
      convert_to(
        'payment-return-v1:' || v_order.guest_lookup_token_hash || ':' || v_order.order_no,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if v_expected <> lower(p_return_token) then
    return null;
  end if;

  return v_order.guest_lookup_token_hash;
end;
$function$;

revoke all on function public.resolve_payment_return_capability_v1(text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_payment_return_capability_v1(text, text)
  to service_role;

comment on function public.resolve_payment_return_capability_v1(text, text) is
  'Service-role-only resolver for the short-lived browser payment return capability. Returns the stored guest token hash only when the order-scoped capability matches.';
