-- Forward-only payment audit hardening. This migration intentionally repeats
-- deployed function definitions so already-migrated environments receive fixes.

create or replace function private.valid_order_transition(
  p_from public.order_status,
  p_to public.order_status
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select p_from = p_to or case p_from
    when 'draft' then p_to in ('payment_ready', 'canceled')
    when 'payment_ready' then p_to in (
      'payment_auth_started', 'waiting_for_deposit', 'paid',
      'payment_failed', 'canceled', 'partially_canceled'
    )
    when 'payment_auth_started' then p_to in (
      'waiting_for_deposit', 'paid', 'payment_failed', 'canceled', 'partially_canceled'
    )
    when 'waiting_for_deposit' then p_to in ('paid', 'payment_failed', 'canceled', 'partially_canceled')
    when 'payment_failed' then p_to in ('payment_ready', 'canceled')
    when 'paid' then p_to in ('waiting_for_deposit', 'cancel_requested', 'canceled', 'partially_canceled', 'refunded', 'shipping_ready')
    when 'cancel_requested' then p_to in ('paid', 'waiting_for_deposit', 'canceled', 'partially_canceled')
    when 'partially_canceled' then p_to in ('cancel_requested', 'canceled', 'refunded', 'shipping_ready')
    when 'shipping_ready' then p_to in ('shipped', 'canceled')
    when 'shipped' then p_to in ('delivered')
    else false
  end;
$function$;

revoke all on function private.valid_order_transition(public.order_status, public.order_status) from public;

create or replace function private.consume_inventory_after_settlement_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.payment_status in ('done', 'partial_canceled')
     and old.payment_status is distinct from new.payment_status then
    perform private.consume_order_inventory(new.id);
  end if;
  return new;
end;
$function$;

revoke all on function private.consume_inventory_after_settlement_v1() from public;
drop trigger if exists orders_consume_inventory_after_settlement on public.orders;
create trigger orders_consume_inventory_after_settlement
after update of payment_status on public.orders
for each row execute function private.consume_inventory_after_settlement_v1();

create or replace function private.resolve_confirmation_review_after_payment_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.payment_status in ('done', 'waiting_for_deposit', 'partial_canceled', 'canceled', 'failed', 'expired')
     and old.payment_status is distinct from new.payment_status then
    update public.payment_attempts
    set status = case
          when new.payment_status = 'canceled' then 'superseded_by_cancellation'
          when new.payment_status in ('failed', 'expired') then 'failed'
          else 'succeeded'
        end,
        error_code = case
          when new.payment_status = 'canceled' then 'PAYMENT_CANCELED'
          when new.payment_status in ('failed', 'expired') then upper(new.payment_status::text)
          else error_code
        end,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = new.id and operation = 'confirm' and status = 'manual_review';
  end if;
  return new;
end;
$function$;

revoke all on function private.resolve_confirmation_review_after_payment_v1() from public;
drop trigger if exists orders_resolve_confirmation_review on public.orders;
create trigger orders_resolve_confirmation_review
after update of payment_status on public.orders
for each row execute function private.resolve_confirmation_review_after_payment_v1();

create or replace function private.stop_fulfillment_after_terminal_payment_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_released integer := 0;
begin
  if old.payment_status is not distinct from new.payment_status
     or new.payment_status not in ('canceled', 'failed', 'expired') then
    return new;
  end if;

  if new.status = 'shipping_ready' then
    v_released := private.release_order_inventory(
      new.id,
      'terminal payment state before shipment',
      true,
      new.payment_status = 'expired'
    );
    update public.orders set status = 'canceled', updated_at = now() where id = new.id;
    insert into public.order_events(order_id, event_type, from_status, to_status, payload_json)
    values (
      new.id, 'fulfillment_stopped_after_payment_terminal', 'shipping_ready', 'canceled',
      jsonb_build_object('paymentStatus', new.payment_status, 'releasedReservations', v_released)
    );
  elsif new.status in ('shipped', 'delivered') then
    insert into public.order_events(order_id, event_type, from_status, to_status, payload_json)
    values (
      new.id, 'post_fulfillment_payment_manual_review', new.status, new.status,
      jsonb_build_object('paymentStatus', new.payment_status)
    );
  end if;
  return new;
end;
$function$;

revoke all on function private.stop_fulfillment_after_terminal_payment_v1() from public;
drop trigger if exists orders_stop_fulfillment_after_terminal_payment on public.orders;
create trigger orders_stop_fulfillment_after_terminal_payment
after update of payment_status on public.orders
for each row execute function private.stop_fulfillment_after_terminal_payment_v1();

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
  if v_order.payment_status not in ('done', 'partial_canceled') then
    raise exception using errcode = '22023', message = 'settled payment is required for shipping';
  end if;
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

create or replace function public.mark_payment_confirmation_review_v1(
  p_payment_id uuid,
  p_lease_token uuid,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_order_id uuid;
begin
  select order_id into strict v_order_id from public.payments where id = p_payment_id;
  select * into strict v_order from public.orders where id = v_order_id for update;
  select * into strict v_payment from public.payments where id = p_payment_id for update;
  if v_payment.order_id <> v_order.id then
    raise exception using errcode = 'P0002', message = 'payment order changed';
  end if;
  if v_payment.reconcile_lease_token is distinct from p_lease_token
     or v_payment.reconcile_lease_until is null
     or v_payment.reconcile_lease_until <= now() then
    raise exception using errcode = '55P03', message = 'stale reconciliation lease';
  end if;
  update public.payment_attempts
  set status = 'manual_review',
      error_code = left(coalesce(p_error_code, 'PAYMENT_MANUAL_REVIEW'), 100),
      response_json = coalesce(response_json, '{}'::jsonb) || jsonb_build_object('manualReview', true),
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where order_id = v_order.id and operation = 'confirm'
    and status in ('started', 'in_progress', 'unknown');

  update public.payments
  set next_reconcile_at = null,
      reconcile_lease_until = null,
      reconcile_lease_token = null,
      last_reconcile_error = 'PAYMENT_MANUAL_REVIEW',
      updated_at = now()
  where id = v_payment.id;

  insert into public.order_events(order_id, event_type, from_status, to_status, payload_json)
  values (
    v_order.id, 'payment_confirmation_manual_review', v_order.status, v_order.status,
    jsonb_build_object('errorCode', left(coalesce(p_error_code, ''), 100))
  );
  return private.payment_operation_payload(v_order.id) || jsonb_build_object('manualReview', true);
end;
$function$;

revoke all on function public.mark_payment_confirmation_review_v1(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payment_confirmation_review_v1(uuid, uuid, text) to service_role;

-- Replace the original cancellation review RPC: a timed-out worker must not
-- clear or stop a lease that a newer reconciliation worker already owns.
revoke all on function public.mark_payment_cancellation_review_v1(text, text, text)
  from public, anon, authenticated, service_role;
drop function public.mark_payment_cancellation_review_v1(text, text, text);

create function public.mark_payment_cancellation_review_v1(
  p_payment_id uuid,
  p_lease_token uuid,
  p_idempotency_key text,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_order_id uuid;
  v_other_active boolean := false;
  v_target_status public.order_status;
begin
  select order_id into strict v_order_id from public.payments where id = p_payment_id;
  select * into strict v_order from public.orders where id = v_order_id for update;
  select * into strict v_payment from public.payments where id = p_payment_id for update;
  if v_payment.order_id <> v_order.id then
    raise exception using errcode = 'P0002', message = 'payment order changed';
  end if;
  if v_payment.reconcile_lease_token is distinct from p_lease_token
     or v_payment.reconcile_lease_until is null
     or v_payment.reconcile_lease_until <= now() then
    raise exception using errcode = '55P03', message = 'stale reconciliation lease';
  end if;

  select * into v_attempt
  from public.payment_attempts
  where order_id = v_order.id and idempotency_key = p_idempotency_key and operation = 'cancel'
  for update;
  if not found or v_attempt.status not in ('started', 'in_progress', 'unknown') then
    return private.payment_operation_payload(v_order.id) || jsonb_build_object('stale', true);
  end if;

  update public.payment_attempts
  set status = 'manual_review',
      error_code = left(coalesce(p_error_code, 'CANCELLATION_MANUAL_REVIEW'), 100),
      response_json = coalesce(response_json, '{}'::jsonb) || jsonb_build_object('manualReview', true),
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where id = v_attempt.id;

  select exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel' and id <> v_attempt.id
      and status in ('started', 'in_progress', 'unknown')
  ) into v_other_active;
  v_target_status := v_order.status;
  if v_order.status in ('paid', 'waiting_for_deposit', 'payment_auth_started', 'partially_canceled') then
    v_target_status := 'cancel_requested';
    update public.orders set status = v_target_status, updated_at = now() where id = v_order.id;
  end if;

  if not v_other_active then
    update public.payments
    set next_reconcile_at = null,
        reconcile_lease_until = null,
        reconcile_lease_token = null,
        last_reconcile_error = 'CANCELLATION_MANUAL_REVIEW',
        updated_at = now()
    where id = v_payment.id and reconcile_lease_token = p_lease_token;
  end if;
  insert into public.order_events(order_id, event_type, from_status, to_status, payload_json)
  values (
    v_order.id, 'payment_cancel_manual_review', v_order.status, v_target_status,
    jsonb_build_object('errorCode', left(coalesce(p_error_code, ''), 100))
  );
  return private.payment_operation_payload(v_order.id) || jsonb_build_object('manualReview', true);
end;
$function$;

revoke all on function public.mark_payment_cancellation_review_v1(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_payment_cancellation_review_v1(uuid, uuid, text, text) to service_role;

-- Orders are exposed through the capability-checked get-order boundary. Raw
-- provider snapshots and payment identifiers are not browser-readable.
revoke select on public.payment_snapshots, public.payments, public.payment_refunds from anon, authenticated;
