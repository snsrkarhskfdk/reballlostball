alter table public.orders
  add column if not exists shipping_carrier text,
  add column if not exists tracking_number text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz;

alter table public.orders
  drop constraint if exists orders_shipping_carrier_format,
  drop constraint if exists orders_tracking_number_format;

alter table public.orders
  add constraint orders_shipping_carrier_format
    check (shipping_carrier is null or (length(btrim(shipping_carrier)) between 1 and 40 and shipping_carrier !~ '[\u0000-\u001f\u007f]')),
  add constraint orders_tracking_number_format
    check (tracking_number is null or (length(btrim(tracking_number)) between 4 and 80 and tracking_number ~ '^[A-Za-z0-9-]+$'));

create or replace function private.order_payload(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'id', o.id,
    'orderNo', o.order_no,
    'orderName', o.order_name,
    'status', o.status,
    'paymentStatus', o.payment_status,
    'paymentProvider', o.payment_provider,
    'paymentMethod', o.payment_method,
    'subtotalKrw', o.subtotal_krw,
    'shippingKrw', o.shipping_krw,
    'discountKrw', o.discount_krw,
    'refundAmount', o.refund_amount,
    'totalKrw', o.total_krw,
    'address', o.address_snapshot,
    'deliveryStatus', case when o.status in ('shipping_ready','shipped','delivered') then o.status::text else '배송 준비 전' end,
    'shippingCarrier', o.shipping_carrier,
    'trackingNumber', o.tracking_number,
    'shippedAt', o.shipped_at,
    'deliveredAt', o.delivered_at,
    'reservationExpiresAt', o.reservation_expires_at,
    'createdAt', o.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'productId', i.product_id,
        'variantId', i.variant_id,
        'productName', i.product_name,
        'variantName', i.variant_name,
        'unitPriceKrw', i.unit_price_krw,
        'quantity', i.qty,
        'lineTotalKrw', i.line_total_krw
      ) order by i.id)
      from public.order_items i
      where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.id = p_order_id;
$function$;

create or replace function public.admin_update_shipping_v1(
  p_actor_user_id uuid,
  p_order_id uuid,
  p_target_status public.order_status,
  p_shipping_carrier text default null,
  p_tracking_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_carrier text := nullif(btrim(coalesce(p_shipping_carrier, '')), '');
  v_tracking text := nullif(btrim(coalesce(p_tracking_number, '')), '');
begin
  if p_actor_user_id is null or not exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_actor_user_id
      and ur.role in ('owner_admin','cs_manager')
  ) then
    raise exception using errcode = '42501', message = 'admin role required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'order not found'; end if;
  if p_target_status not in ('shipping_ready','shipped','delivered') then
    raise exception using errcode = '22023', message = 'invalid shipping status';
  end if;

  if p_target_status = 'shipping_ready' then
    if v_order.status not in ('paid','shipping_ready') then
      raise exception using errcode = '22023', message = 'order is not ready for shipping';
    end if;
    update public.orders set status='shipping_ready', updated_at=now() where id=p_order_id;
  elsif p_target_status = 'shipped' then
    if v_order.status not in ('shipping_ready','shipped') then
      raise exception using errcode = '22023', message = 'order cannot be shipped';
    end if;
    if v_carrier is null or length(v_carrier)>40 or v_tracking is null
       or length(v_tracking) not between 4 and 80 or v_tracking !~ '^[A-Za-z0-9-]+$' then
      raise exception using errcode = '22023', message = 'carrier and tracking number are required';
    end if;
    update public.orders
      set status='shipped', shipping_carrier=v_carrier, tracking_number=v_tracking,
          shipped_at=coalesce(shipped_at,now()), updated_at=now()
      where id=p_order_id;
  else
    if v_order.status not in ('shipped','delivered') then
      raise exception using errcode = '22023', message = 'order must be shipped before delivery';
    end if;
    update public.orders
      set status='delivered', delivered_at=coalesce(delivered_at,now()), updated_at=now()
      where id=p_order_id;
  end if;

  insert into public.order_events(order_id, actor_user_id, event_type, from_status, to_status, payload_json)
  values (p_order_id, p_actor_user_id, 'shipping_status_updated', v_order.status, p_target_status,
          jsonb_build_object('carrier',v_carrier,'trackingNumber',v_tracking));
  return private.order_payload(p_order_id);
end;
$function$;

revoke all on function public.admin_update_shipping_v1(uuid, uuid, public.order_status, text, text) from public, anon, authenticated;
grant execute on function public.admin_update_shipping_v1(uuid, uuid, public.order_status, text, text) to service_role;
