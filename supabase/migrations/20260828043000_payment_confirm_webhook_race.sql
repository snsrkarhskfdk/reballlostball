-- Payment confirmation / webhook race repairs found by the adversarial payment audit.
--
-- 1. claim_payment_confirmation_v1 refused every browser confirmation while the order sat in
--    'payment_auth_started'. A provider webhook re-queried as IN_PROGRESS puts the order into
--    that state before the browser returns from the Toss redirect, after which the customer
--    could never finish paying: prepare-payment only re-issues for 'payment_ready', so the
--    order stayed stuck and its stock stayed reserved until the provider expired the payment.
--    Re-confirming the same payment key is safe, so only a *different* key defers to
--    reconciliation now.
--
-- 2. apply_payment_webhook_v1 released inventory for ABORTED/EXPIRED without including already
--    consumed reservations. An order that had been paid and then cancel-requested was moved to
--    'canceled' with its stock never returned.
--
-- Both functions are recreated in full so this migration is the single source of truth for them.

create or replace function public.claim_payment_confirmation_v1(
  p_order_no text,
  p_actor_user_id uuid,
  p_guest_token_hash text,
  p_payment_key text,
  p_amount integer,
  p_idempotency_key text,
  p_request_hash text
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
begin
  if length(coalesce(p_payment_key, '')) < 6 or length(p_payment_key) > 200
     or length(coalesce(p_idempotency_key, '')) < 16 or length(p_idempotency_key) > 300
     or coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid payment confirmation request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('payment-confirm:' || btrim(p_order_no), 0));
  select * into strict v_order
  from public.orders where order_no = btrim(p_order_no) for update;

  if not private.can_access_order(v_order.id, p_actor_user_id, p_guest_token_hash, false) then
    raise exception using errcode = '42501', message = 'order access denied';
  end if;
  if p_amount <> v_order.total_krw then
    raise exception using errcode = '22023', message = 'payment amount mismatch';
  end if;

  select * into strict v_payment
  from public.payments
  where order_id = v_order.id and provider = v_order.payment_provider
  for update;

  if v_order.status in ('canceled', 'partially_canceled', 'refunded') then
    update public.payment_attempts
    set status = 'superseded_by_cancellation',
        error_code = 'PAYMENT_CANCELED',
        response_json = coalesce(response_json, '{}'::jsonb)
          || jsonb_build_object('supersededBy', 'cancellation'),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = v_order.id and operation = 'confirm'
      and status in ('started', 'in_progress', 'unknown');
    return private.order_payload(v_order.id) || jsonb_build_object(
      'paymentTerminated', true,
      'attemptStatus', 'superseded_by_cancellation',
      'idempotencyKey', p_idempotency_key
    );
  end if;

  if v_order.status = 'cancel_requested' or exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown')
  ) then
    return private.order_payload(v_order.id) || jsonb_build_object(
      'cancellationPending', true,
      'idempotencyKey', p_idempotency_key
    );
  end if;

  if v_order.status in ('paid', 'waiting_for_deposit') then
    if v_payment.toss_payment_key is not null and v_payment.toss_payment_key <> p_payment_key then
      raise exception using errcode = '23505', message = 'order already has another payment';
    end if;
    return private.order_payload(v_order.id) || jsonb_build_object(
      'alreadyFinalized', true, 'idempotencyKey', p_idempotency_key
    );
  end if;

  select * into v_attempt
  from public.payment_attempts
  where idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_attempt.order_id <> v_order.id or v_attempt.request_hash <> p_request_hash then
      raise exception using errcode = '23505', message = 'payment idempotency payload mismatch';
    end if;
    return private.order_payload(v_order.id) || jsonb_build_object(
      'duplicate', true,
      'attemptStatus', v_attempt.status,
      'idempotencyKey', v_attempt.idempotency_key
    );
  end if;

  if exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'confirm'
      and status in ('started', 'in_progress', 'unknown')
  ) then
    raise exception using errcode = '55P03', message = 'payment confirmation already in progress';
  end if;
  -- A provider webhook can move the order to payment_auth_started before the browser
  -- returns from the redirect. Re-confirming the SAME payment key is safe: the amount was
  -- already matched against the order above, and the provider call is idempotent on the
  -- attempt key. Only a different payment key still needs provider reconciliation.
  if v_order.status = 'payment_auth_started'
     and v_payment.toss_payment_key is not null
     and v_payment.toss_payment_key <> p_payment_key then
    raise exception using errcode = '55P03', message = 'payment confirmation requires provider reconciliation';
  end if;
  if v_order.reservation_expires_at is not null and v_order.reservation_expires_at <= now() then
    perform private.release_order_inventory(v_order.id, 'payment confirmation after expiry', false, true);
    update public.orders
    set status = 'payment_failed', payment_status = 'expired', updated_at = now()
    where id = v_order.id;
    update public.payments
    set status = 'expired', next_reconcile_at = null,
        reconcile_lease_until = null, reconcile_lease_token = null,
        updated_at = now()
    where id = v_payment.id;
    insert into public.order_events (order_id, event_type, from_status, to_status, payload_json)
    values (v_order.id, 'payment_expired', v_order.status, 'payment_failed', '{}'::jsonb);
    return private.order_payload(v_order.id) || jsonb_build_object('expired', true);
  end if;
  if v_order.status not in ('payment_ready', 'payment_auth_started') then
    raise exception using errcode = 'P0001', message = 'order is not ready for payment';
  end if;

  insert into public.payment_attempts (
    order_id, provider, operation, idempotency_key, request_hash,
    request_json, status, created_at, updated_at
  ) values (
    v_order.id, v_order.payment_provider, 'confirm', p_idempotency_key, p_request_hash,
    jsonb_build_object('orderNo', v_order.order_no, 'amount', p_amount),
    'in_progress', now(), now()
  ) returning * into v_attempt;

  -- The provider call happens after this transaction commits. Extend the stock lease so
  -- the expiry worker cannot release inventory while Toss confirmation is in flight.
  update public.inventory_reservations
  set expires_at = greatest(expires_at, now() + interval '15 minutes'),
      updated_at = now()
  where order_id = v_order.id and status = 'reserved';

  update public.payments
  set toss_payment_key = p_payment_key,
      status = 'in_progress',
      next_reconcile_at = now() + interval '2 minutes',
      last_reconcile_error = null,
      updated_at = now()
  where id = v_payment.id;
  update public.orders
  set status = 'payment_auth_started', payment_status = 'in_progress',
      reservation_expires_at = greatest(
        coalesce(reservation_expires_at, now()),
        now() + interval '15 minutes'
      ),
      updated_at = now()
  where id = v_order.id;
  insert into public.order_events (order_id, actor_user_id, event_type, from_status, to_status, payload_json)
  values (
    v_order.id, p_actor_user_id, 'payment_confirmation_claimed',
    v_order.status, 'payment_auth_started', jsonb_build_object('attemptId', v_attempt.id)
  );

  return private.order_payload(v_order.id) || jsonb_build_object(
    'duplicate', false,
    'attemptId', v_attempt.id,
    'idempotencyKey', p_idempotency_key
  );
end;
$$;

create or replace function public.apply_payment_webhook_v1(
  p_event_id uuid,
  p_order_no text,
  p_payment_key text,
  p_amount integer,
  p_canceled_amount integer,
  p_provider_status text,
  p_transaction_id text,
  p_approval_no text,
  p_approved_at timestamptz,
  p_virtual_due_at timestamptz,
  p_webhook_secret_hash text,
  p_safe_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.payment_events%rowtype;
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_from_status public.order_status;
  v_target_order public.order_status;
  v_target_payment public.payment_status;
  v_status text := upper(btrim(p_provider_status));
  v_released integer := 0;
  v_new_canceled_amount integer;
  v_cancel_delta integer := 0;
  v_refund_total integer := 0;
  v_refund_delta integer := 0;
  v_active_cancel boolean := false;
  v_blocking_cancel boolean := false;
  v_partial_blocking_unresolved boolean := false;
  v_pending_cancel boolean := false;
begin
  select * into strict v_event from public.payment_events where id = p_event_id for update;
  select * into strict v_order from public.orders where id = v_event.order_id and order_no = btrim(p_order_no) for update;
  select * into strict v_payment from public.payments where id = v_event.payment_id for update;
  v_from_status := v_order.status;

  if v_event.processing_status = 'processed' then
    return private.order_payload(v_order.id) || jsonb_build_object('duplicate', true);
  end if;
  if p_amount <> v_order.total_krw or p_amount <> v_payment.requested_amount then
    raise exception using errcode = '22023', message = 'webhook payment amount mismatch';
  end if;
  if coalesce(p_canceled_amount, 0) < 0
     or coalesce(p_canceled_amount, 0) > v_payment.requested_amount then
    raise exception using errcode = '22023', message = 'webhook canceled amount mismatch';
  end if;
  if v_payment.toss_payment_key is not null and p_payment_key is not null
     and v_payment.toss_payment_key <> p_payment_key then
    raise exception using errcode = '23505', message = 'webhook payment key mismatch';
  end if;

  -- The locked order serializes this check with cancellation claims.
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

  case v_status
    when 'DONE' then
      v_target_order := 'paid'; v_target_payment := 'done';
    when 'WAITING_FOR_DEPOSIT' then
      v_target_order := 'waiting_for_deposit'; v_target_payment := 'waiting_for_deposit';
    when 'IN_PROGRESS' then
      v_target_order := 'payment_auth_started'; v_target_payment := 'in_progress';
    when 'READY' then
      v_target_order := 'payment_ready'; v_target_payment := 'ready';
    when 'CANCELED' then
      v_target_order := 'canceled'; v_target_payment := 'canceled';
      v_new_canceled_amount := v_payment.requested_amount;
    when 'PARTIAL_CANCELED' then
      v_target_order := 'partially_canceled'; v_target_payment := 'partial_canceled';
      v_new_canceled_amount := coalesce(p_canceled_amount, 0);
      if v_new_canceled_amount <= 0 or v_new_canceled_amount >= v_payment.requested_amount then
        raise exception using errcode = '22023', message = 'invalid partial cancellation amount';
      end if;
    when 'ABORTED' then
      v_target_order := case when v_order.status = 'cancel_requested' then 'canceled'::public.order_status else 'payment_failed'::public.order_status end;
      v_target_payment := 'failed';
    when 'EXPIRED' then
      v_target_order := case when v_order.status = 'cancel_requested' then 'canceled'::public.order_status else 'payment_failed'::public.order_status end;
      v_target_payment := 'expired';
    else
      raise exception using errcode = '22023', message = 'unsupported provider status';
  end case;

  if v_status = 'PARTIAL_CANCELED' and v_blocking_cancel then
    select exists (
      select 1 from public.payment_attempts
      where order_id = v_order.id and operation = 'cancel'
        and status in ('started', 'in_progress', 'unknown', 'manual_review')
        and greatest(v_payment.canceled_amount, coalesce(p_canceled_amount, 0))
          <= coalesce((request_json ->> 'canceledAmountBefore')::integer, 0)
    ) into v_partial_blocking_unresolved;
  end if;

  -- Provider payment truth is recorded, but fulfillment remains blocked until the
  -- outstanding cancellation has a definitive result.
  if v_blocking_cancel and (
    v_status in ('DONE', 'WAITING_FOR_DEPOSIT')
    or (v_status = 'PARTIAL_CANCELED' and v_partial_blocking_unresolved)
  ) then
    v_target_order := 'cancel_requested';
    if v_payment.status = 'partial_canceled' then
      v_target_payment := 'partial_canceled';
    end if;
  end if;

  -- The provider object is re-queried before this RPC, but a confirmation
  -- response or another worker can still be older than a DONE state already
  -- committed locally. Provider pre-settlement states must be monotonic here.
  if v_payment.status = 'done' and v_status in ('READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT') then
    v_target_order := v_order.status;
    v_target_payment := 'done';
  elsif v_payment.status = 'partial_canceled'
        and v_status in ('READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'DONE') then
    v_target_order := v_order.status;
    v_target_payment := 'partial_canceled';
  elsif v_payment.status = 'canceled'
        and v_status in ('READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'DONE', 'PARTIAL_CANCELED') then
    v_target_order := v_order.status;
    v_target_payment := 'canceled';
  end if;

  -- Replayed or out-of-order lower states never downgrade terminal fulfillment.
  if v_order.status in ('shipping_ready', 'shipped', 'delivered')
     and v_target_order not in ('shipping_ready', 'shipped', 'delivered') then
    v_target_order := v_order.status;
  elsif not private.valid_order_transition(v_order.status, v_target_order) then
    -- Repeated READY/IN_PROGRESS events after a final state are recorded but harmless.
    if v_order.status in ('waiting_for_deposit', 'paid', 'cancel_requested', 'canceled', 'partially_canceled', 'refunded')
       and v_target_order in ('payment_ready', 'payment_auth_started', 'payment_failed') then
      v_target_order := v_order.status;
      v_target_payment := v_order.payment_status;
    else
      raise exception using errcode = 'P0001', message = 'invalid webhook state transition';
    end if;
  end if;

  -- Apply inventory side effects only after the final transition has been resolved.
  -- Replayed lower-state events must never release or consume stock accidentally.
  if v_status = 'DONE' and v_target_payment = 'done' then
    perform private.consume_order_inventory(v_order.id);
  elsif v_status = 'WAITING_FOR_DEPOSIT' and v_target_payment = 'waiting_for_deposit' then
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
  elsif v_status = 'CANCELED' and v_target_order = 'canceled'
        and v_order.status not in ('shipping_ready', 'shipped', 'delivered') then
    v_released := private.release_order_inventory(v_order.id, 'provider cancellation webhook', true, false);
  elsif v_status in ('ABORTED', 'EXPIRED')
        and v_target_order in ('payment_failed', 'canceled')
        and v_order.status not in ('paid', 'shipping_ready', 'shipped', 'delivered') then
    v_released := private.release_order_inventory(
      v_order.id,
      case when v_status = 'EXPIRED' then 'provider payment expired' else 'provider aborted payment' end,
      -- A cancel-requested order may already have consumed its reservation during a
      -- successful confirmation. Returning it to 'canceled' has to return that stock too.
      v_target_order = 'canceled',
      v_status = 'EXPIRED'
    );
  end if;

  if v_status in ('CANCELED', 'PARTIAL_CANCELED') then
    v_new_canceled_amount := greatest(v_payment.canceled_amount, v_new_canceled_amount);
    v_cancel_delta := v_new_canceled_amount - v_payment.canceled_amount;
  else
    v_new_canceled_amount := v_payment.canceled_amount;
  end if;
  v_refund_total := least(
    case
      when coalesce(v_payment.approved_amount, 0) > 0 then v_payment.approved_amount
      when p_approved_at is not null and v_status in ('CANCELED', 'PARTIAL_CANCELED') then p_amount
      else 0
    end,
    v_new_canceled_amount
  );
  v_refund_delta := greatest(0, v_refund_total - v_order.refund_amount);

  update public.payments
  set toss_payment_key = coalesce(toss_payment_key, p_payment_key),
      status = v_target_payment,
      approved_amount = case
        when v_status = 'DONE' then p_amount
        when v_status in ('CANCELED', 'PARTIAL_CANCELED') and p_approved_at is not null
          then greatest(coalesce(approved_amount, 0), p_amount)
        else approved_amount
      end,
      canceled_amount = v_new_canceled_amount,
      transaction_id = coalesce(nullif(left(coalesce(p_transaction_id, ''), 200), ''), transaction_id),
      approval_no = coalesce(nullif(left(coalesce(p_approval_no, ''), 100), ''), approval_no),
      approved_at = case
        when v_status = 'DONE' then coalesce(p_approved_at, approved_at, now())
        when v_status in ('CANCELED', 'PARTIAL_CANCELED') then coalesce(approved_at, p_approved_at)
        else approved_at
      end,
      canceled_at = case when v_status in ('CANCELED', 'PARTIAL_CANCELED') then now() else canceled_at end,
      webhook_secret_hash = case
        when p_webhook_secret_hash ~ '^[0-9a-f]{64}$' then p_webhook_secret_hash
        else webhook_secret_hash
      end,
      virtual_due_at = case
        when v_target_payment = 'waiting_for_deposit' then coalesce(p_virtual_due_at, virtual_due_at)
        else virtual_due_at
      end,
      next_reconcile_at = case
        when v_active_cancel and v_target_order = 'cancel_requested' then now() + interval '2 minutes'
        when v_blocking_cancel and v_target_order = 'cancel_requested' then null
        when v_target_payment = 'waiting_for_deposit' then now() + interval '15 minutes'
        when v_target_payment = 'in_progress' then now() + interval '2 minutes'
        else null
      end,
      reconcile_lease_until = null,
      reconcile_lease_token = null,
      last_reconcile_error = null,
      raw_response_json = coalesce(p_safe_payload, raw_response_json),
      updated_at = now()
  where id = v_payment.id;

  if v_refund_delta > 0 then
    insert into public.payment_refunds (
      payment_id, cancel_reason, cancel_amount, refund_status, requested_at, completed_at
    ) values (
      v_payment.id, 'provider webhook reconciliation', v_refund_delta,
      'completed', now(), now()
    );
  end if;

  update public.orders
  set status = v_target_order,
      payment_status = v_target_payment,
      refund_amount = greatest(refund_amount, v_refund_total),
      transaction_id = coalesce(nullif(left(coalesce(p_transaction_id, ''), 200), ''), transaction_id),
      approval_no = coalesce(nullif(left(coalesce(p_approval_no, ''), 100), ''), approval_no),
      updated_at = now()
  where id = v_order.id;

  if v_status = 'CANCELED'
     or (v_status in ('ABORTED', 'EXPIRED') and v_target_order = 'canceled') then
    update public.payment_attempts
    set status = 'succeeded',
        response_json = coalesce(p_safe_payload, response_json, '{}'::jsonb),
        sensitive_request_ciphertext = null,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown', 'manual_review');
  elsif v_status = 'PARTIAL_CANCELED' then
    update public.payment_attempts
    set status = case
          when coalesce((request_json ->> 'canceledAmountBefore')::integer, 0)
               + coalesce((request_json ->> 'cancelAmount')::integer, 0)
               <= v_new_canceled_amount
          then 'succeeded'
          else 'partially_succeeded'
        end,
        response_json = coalesce(p_safe_payload, response_json, '{}'::jsonb),
        sensitive_request_ciphertext = null,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown', 'manual_review')
      and v_new_canceled_amount > coalesce((request_json ->> 'canceledAmountBefore')::integer, 0);
  end if;

  if v_target_order = 'canceled'
     and v_status in ('CANCELED', 'ABORTED', 'EXPIRED') then
    update public.payment_attempts
    set status = 'superseded_by_cancellation',
        error_code = 'PAYMENT_CANCELED',
        response_json = coalesce(response_json, '{}'::jsonb)
          || jsonb_build_object('supersededBy', 'provider_cancellation'),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = v_order.id and operation = 'confirm'
      and status in ('started', 'in_progress', 'unknown');
  elsif v_status in ('DONE', 'WAITING_FOR_DEPOSIT', 'PARTIAL_CANCELED') then
    update public.payment_attempts
    set status = 'succeeded',
        response_json = coalesce(p_safe_payload, response_json, '{}'::jsonb),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = v_order.id and operation = 'confirm'
      and status in ('started', 'in_progress', 'unknown');
  elsif v_target_order = 'payment_failed' and v_status in ('ABORTED', 'EXPIRED') then
    update public.payment_attempts
    set status = 'failed',
        error_code = v_status,
        response_json = coalesce(p_safe_payload, response_json, '{}'::jsonb),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where order_id = v_order.id and operation = 'confirm'
      and status in ('started', 'in_progress', 'unknown');
  end if;

  select exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown')
  ) into v_pending_cancel;
  if v_pending_cancel then
    update public.payments
    set next_reconcile_at = now() + interval '2 minutes', updated_at = now()
    where id = v_payment.id;
  end if;

  update public.payment_events
  set processing_status = 'processed', processed_at = now(), last_error = null,
      payload_json = coalesce(p_safe_payload, payload_json), updated_at = now()
  where id = v_event.id;
  insert into public.order_events (order_id, event_type, from_status, to_status, payload_json)
  values (
    v_order.id, 'payment_webhook_' || lower(v_status), v_from_status, v_target_order,
    jsonb_build_object(
      'paymentEventId', v_event.id,
      'releasedQty', v_released,
      'cancelDelta', v_cancel_delta,
      'canceledAmount', v_new_canceled_amount,
      'refundDelta', v_refund_delta,
      'refundAmount', v_refund_total
    )
  );

  return private.order_payload(v_order.id) || jsonb_build_object('duplicate', false, 'releasedQty', v_released);
end;
$$;


-- The functions above are replaced in place, so their existing privileges carry over.
-- Restating them keeps this migration self-sufficient if it is ever replayed on a fresh
-- database, and keeps every public payment RPC service-role only.
revoke all on function public.claim_payment_confirmation_v1(text, uuid, text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.apply_payment_webhook_v1(uuid, text, text, integer, integer, text, text, text, timestamptz, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_payment_confirmation_v1(text, uuid, text, text, integer, text, text) to service_role;
grant execute on function public.apply_payment_webhook_v1(uuid, text, text, integer, integer, text, text, text, timestamptz, timestamptz, text, jsonb) to service_role;
