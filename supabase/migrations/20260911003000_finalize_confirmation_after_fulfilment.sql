-- ASTRA-P2-6: a confirmation finalizing after fulfilment advanced reported failure
-- for a payment that had already succeeded.
--
-- Sequence: the confirmation claims an attempt; Toss approves; its webhook records
-- paid/done; staff advance the order to shipping_ready; the original confirmation
-- then reaches this finalizer. It targeted 'paid' unconditionally for DONE, so
-- valid_order_transition('shipping_ready','paid') failed with P0001. _shared/supabase.ts
-- mapped that to 422, which toss-client reads as definitive: the stored confirmation
-- tuple was deleted, and a capability-only guest received no rotated lookup token
-- because rotation happens after this call.
--
-- This mirrors the guard immediately below it, which already protects the DONE state
-- from a stale WAITING_FOR_DEPOSIT response. Only the function body changes.
create or replace function public.finalize_payment_confirmation_v1(
  p_order_no text,
  p_idempotency_key text,
  p_payment_key text,
  p_amount integer,
  p_provider_status text,
  p_method public.payment_method,
  p_transaction_id text,
  p_approval_no text,
  p_approved_at timestamptz,
  p_webhook_secret_hash text,
  p_virtual_due_at timestamptz,
  p_safe_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_attempt public.payment_attempts%rowtype;
  v_target_order public.order_status;
  v_target_payment public.payment_status;
  v_active_cancel boolean := false;
  v_blocking_cancel boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended('payment-confirm:' || btrim(p_order_no), 0));
  select * into strict v_order from public.orders where order_no = btrim(p_order_no) for update;
  select * into strict v_payment
  from public.payments where order_id = v_order.id and provider = v_order.payment_provider for update;
  select * into strict v_attempt
  from public.payment_attempts
  where order_id = v_order.id and idempotency_key = p_idempotency_key and operation = 'confirm'
  for update;

  if p_amount <> v_order.total_krw or p_amount <> v_payment.requested_amount then
    raise exception using errcode = '22023', message = 'payment amount mismatch';
  end if;
  if v_payment.toss_payment_key is not null and v_payment.toss_payment_key <> p_payment_key then
    raise exception using errcode = '23505', message = 'payment key mismatch';
  end if;

  if v_order.status in ('canceled', 'partially_canceled', 'refunded') then
    update public.payment_attempts
    set status = 'superseded_by_cancellation',
        error_code = 'PAYMENT_CANCELED',
        response_json = coalesce(response_json, '{}'::jsonb)
          || jsonb_build_object('supersededBy', 'cancellation'),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = v_attempt.id and status in ('started', 'in_progress', 'unknown');
    return private.order_payload(v_order.id) || jsonb_build_object(
      'duplicate', true, 'paymentTerminated', true
    );
  end if;

  -- The order row lock makes this stable against a concurrent cancellation claim,
  -- because every claim locks the same order before creating its attempt.
  select exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown')
  ) into v_active_cancel;
  select exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown', 'manual_review')
  ) into v_blocking_cancel;

  case upper(p_provider_status)
    when 'DONE' then
      v_target_order := 'paid';
      v_target_payment := 'done';
    when 'WAITING_FOR_DEPOSIT' then
      v_target_order := 'waiting_for_deposit';
      v_target_payment := 'waiting_for_deposit';
    else
      raise exception using errcode = '22023', message = 'provider payment is not finalized';
  end case;

  -- A late confirmation must not reopen fulfillment while a provider cancellation
  -- is unresolved. Preserve a prior partial-cancel ledger on replay as well.
  if v_blocking_cancel then
    v_target_order := 'cancel_requested';
    if v_payment.status = 'partial_canceled' then
      v_target_payment := 'partial_canceled';
    end if;
  end if;

  -- Fulfilment can advance between the provider reaching DONE and this finalizer
  -- acquiring the order lock: the webhook records paid/done, staff move the order to
  -- shipping_ready or beyond, and only then does the original confirmation arrive.
  -- Targeting 'paid' would be a backwards transition, so valid_order_transition
  -- raised P0001, the Edge layer returned 422, and the browser treated a payment that
  -- actually succeeded as a definitive failure and discarded its confirmation tuple.
  -- The payment is already authoritative here, so keep the order where it is and let
  -- the duplicate short-circuit below report success.
  if v_payment.status = 'done' and upper(p_provider_status) = 'DONE'
     and v_order.status in ('shipping_ready', 'shipped', 'delivered')
     and not v_blocking_cancel then
    v_target_order := v_order.status;
  end if;

  -- A virtual-account deposit can complete between the provider confirmation
  -- response and this finalizer acquiring the order lock. Never let the stale
  -- WAITING_FOR_DEPOSIT response downgrade an already authoritative DONE state.
  if v_payment.status = 'done' and upper(p_provider_status) = 'WAITING_FOR_DEPOSIT' then
    v_target_payment := 'done';
    v_target_order := case
      when v_order.status = 'cancel_requested' or v_blocking_cancel then 'cancel_requested'::public.order_status
      when v_order.status in ('shipping_ready', 'shipped', 'delivered') then v_order.status
      else 'paid'::public.order_status
    end;
  end if;

  if v_order.status = v_target_order and v_payment.status = v_target_payment then
    update public.payment_attempts
    set status = 'succeeded', completed_at = coalesce(completed_at, now()), updated_at = now()
    where id = v_attempt.id;
    update public.payments
    set next_reconcile_at = case
          when v_active_cancel then now() + interval '2 minutes'
          when v_blocking_cancel then null
          when v_target_payment = 'waiting_for_deposit' then now() + interval '15 minutes'
          else null
        end,
        reconcile_lease_until = null,
        reconcile_lease_token = null,
        last_reconcile_error = null,
        updated_at = now()
    where id = v_payment.id;
    return private.order_payload(v_order.id) || jsonb_build_object('duplicate', true);
  end if;
  if not private.valid_order_transition(v_order.status, v_target_order) then
    raise exception using errcode = 'P0001', message = 'invalid payment state transition';
  end if;

  if v_target_payment = 'done' then
    perform private.consume_order_inventory(v_order.id);
  elsif v_target_payment = 'waiting_for_deposit' then
    update public.inventory_reservations
    set expires_at = greatest(expires_at, coalesce(p_virtual_due_at, now() + interval '15 minutes')),
        updated_at = now()
    where order_id = v_order.id and status = 'reserved';
    update public.orders
    set reservation_expires_at = greatest(
      coalesce(reservation_expires_at, now()),
      coalesce(p_virtual_due_at, now() + interval '15 minutes')
    )
    where id = v_order.id;
  end if;

  update public.payments
  set toss_payment_key = p_payment_key,
      method = p_method,
      status = v_target_payment,
      approved_amount = case when v_target_payment = 'done' then p_amount else approved_amount end,
      transaction_id = nullif(left(coalesce(p_transaction_id, ''), 200), ''),
      approval_no = nullif(left(coalesce(p_approval_no, ''), 100), ''),
      approved_at = case when v_target_payment = 'done' then coalesce(p_approved_at, now()) else approved_at end,
      webhook_secret_hash = case
        when p_webhook_secret_hash ~ '^[0-9a-f]{64}$' then p_webhook_secret_hash
        else webhook_secret_hash
      end,
      virtual_due_at = case
        when v_target_payment = 'waiting_for_deposit' then coalesce(p_virtual_due_at, virtual_due_at)
        else virtual_due_at
      end,
      next_reconcile_at = case
        when v_active_cancel then now() + interval '2 minutes'
        when v_blocking_cancel then null
        when v_target_payment = 'waiting_for_deposit' then now() + interval '15 minutes'
        else null
      end,
      reconcile_lease_until = null,
      reconcile_lease_token = null,
      last_reconcile_error = null,
      raw_response_json = coalesce(p_safe_payload, '{}'::jsonb),
      updated_at = now()
  where id = v_payment.id;
  update public.orders
  set status = v_target_order,
      payment_status = v_target_payment,
      transaction_id = nullif(left(coalesce(p_transaction_id, ''), 200), ''),
      approval_no = nullif(left(coalesce(p_approval_no, ''), 100), ''),
      updated_at = now()
  where id = v_order.id;
  update public.payment_attempts
  set response_json = coalesce(p_safe_payload, '{}'::jsonb), status = 'succeeded',
      completed_at = now(), updated_at = now()
  where id = v_attempt.id;
  insert into public.payment_snapshots (order_id, payload_json)
  values (v_order.id, coalesce(p_safe_payload, '{}'::jsonb));
  insert into public.order_events (order_id, event_type, from_status, to_status, payload_json)
  values (
    v_order.id,
    case
      when v_target_payment = 'done' then 'payment_paid'
      when v_target_payment = 'waiting_for_deposit' then 'payment_waiting_for_deposit'
      else 'payment_confirmation_replayed_during_cancel'
    end,
    v_order.status, v_target_order,
    jsonb_build_object('providerStatus', upper(p_provider_status), 'attemptId', v_attempt.id)
  );

  return private.order_payload(v_order.id) || jsonb_build_object('duplicate', false);
end;
$$;
