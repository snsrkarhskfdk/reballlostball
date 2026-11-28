-- Security fix: claim_payment_cancellation_v1 authorization could evaluate to NULL.
--
-- A guest order has profile_id NULL. For an unrelated authenticated member the first
-- branch became `true and (NULL = <member>)` = NULL, the other two were false, and
-- `NULL or false or false` is NULL. PL/pgSQL's `if not NULL then` does not take its
-- branch, so the 42501 deny never fired. Any signed-in customer who knew a guest
-- order number could cancel that order -- locally when unpaid, and through the
-- service-authorized Toss cancellation when paid.
--
-- SELECT ... WHERE treats NULL as not-true, which is why private.can_access_order
-- (same shape, different context) was never affected. Only this PL/pgSQL assignment
-- was. Make the guest branch explicit and force a definite boolean at both the
-- assignment and the test.
create or replace function public.claim_payment_cancellation_v1(
  p_order_no text,
  p_actor_user_id uuid,
  p_guest_token_hash text,
  p_idempotency_key text,
  p_request_hash text,
  p_reason text,
  p_sensitive_request_ciphertext text
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
  v_allowed boolean := false;
  v_cancel_amount integer := 0;
  v_local_only boolean := false;
  v_requires_refund_account boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended('payment-cancel:' || btrim(p_order_no), 0));
  select * into strict v_order from public.orders where order_no = btrim(p_order_no) for update;
  select * into strict v_payment
  from public.payments where order_id = v_order.id and provider = v_order.payment_provider for update;

  -- Every branch must yield a definite boolean. For a guest order profile_id is
  -- NULL, so `v_order.profile_id = p_actor_user_id` evaluated to NULL rather than
  -- false for an unrelated signed-in member. NULL OR false OR false is NULL, and
  -- `if not NULL` does not take its branch, so the deny path never ran: any
  -- authenticated customer who knew a guest order number passed this gate.
  v_allowed := coalesce((
    p_actor_user_id is not null
    and v_order.profile_id is not null
    and v_order.profile_id = p_actor_user_id
  ) or (
    p_guest_token_hash is not null and v_order.profile_id is null
    and v_order.guest_lookup_token_hash = p_guest_token_hash
    and v_order.guest_lookup_expires_at > now()
  ) or (
    p_actor_user_id is not null and (
      private.user_has_role(p_actor_user_id, 'payments_manager')
      or private.user_has_role(p_actor_user_id, 'owner_admin')
    )
  ), false);
  if not coalesce(v_allowed, false) then
    raise exception using errcode = '42501', message = 'order access denied';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 2 or length(p_reason) > 200
     or length(coalesce(p_idempotency_key, '')) < 16 or length(p_idempotency_key) > 300
     or coalesce(p_request_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid cancellation request';
  end if;

  -- Resolve the stable idempotency record before validating current provider state.
  -- A successful virtual-account refund changes payment.status to canceled, but the
  -- original identical request must still be replayable without losing its response.
  select * into v_attempt from public.payment_attempts
  where idempotency_key = p_idempotency_key for update;
  if found then
    if v_attempt.order_id <> v_order.id or v_attempt.request_hash <> p_request_hash then
      raise exception using errcode = '23505', message = 'cancellation idempotency payload mismatch';
    end if;
    return private.payment_operation_payload(v_order.id) || jsonb_build_object(
      'duplicate', true, 'attemptStatus', v_attempt.status,
      'paymentKey', v_payment.toss_payment_key,
      'canceledAmountBefore', coalesce((v_attempt.request_json ->> 'canceledAmountBefore')::integer, 0),
      'cancelAmount', coalesce((v_attempt.request_json ->> 'cancelAmount')::integer, 0),
      'localOnly', coalesce((v_attempt.request_json ->> 'localOnly')::boolean, false)
    );
  end if;

  v_local_only := v_payment.toss_payment_key is null or v_payment.status in ('ready', 'failed', 'expired');
  v_cancel_amount := case
    when v_local_only then 0
    else greatest(0, coalesce(v_payment.approved_amount, v_payment.requested_amount) - v_payment.canceled_amount)
  end;
  v_requires_refund_account := v_order.payment_method = 'virtual_account'
    and v_payment.status in ('done', 'partial_canceled');
  if v_requires_refund_account and (
    p_sensitive_request_ciphertext is null
    or length(p_sensitive_request_ciphertext) not between 32 and 4096
    or p_sensitive_request_ciphertext !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{20,}$'
  ) then
    raise exception using errcode = '22023', message = 'refund account is required for deposited virtual account cancellation';
  end if;
  if not v_requires_refund_account and p_sensitive_request_ciphertext is not null then
    raise exception using errcode = '22023', message = 'refund account is not accepted for this payment';
  end if;

  -- Idempotent retries must be answered before terminal-state rejection. Otherwise a
  -- successful cancellation whose response was lost cannot be replayed safely.
  if v_order.status in ('shipping_ready', 'shipped', 'delivered', 'canceled', 'refunded') then
    raise exception using errcode = 'P0001', message = 'order cannot be canceled';
  end if;
  if exists (
    select 1 from public.payment_attempts
    where order_id = v_order.id and operation = 'cancel'
      and status in ('started', 'in_progress', 'unknown')
  ) then
    raise exception using errcode = '55P03', message = 'payment cancellation already in progress';
  end if;

  insert into public.payment_attempts (
    order_id, provider, operation, idempotency_key, request_hash,
    request_json, sensitive_request_ciphertext, status, created_at, updated_at
  ) values (
    v_order.id, v_payment.provider, 'cancel', p_idempotency_key, p_request_hash,
    jsonb_build_object(
      'reason', left(btrim(p_reason), 200),
      'canceledAmountBefore', v_payment.canceled_amount,
      'cancelAmount', v_cancel_amount,
      'localOnly', v_local_only
    ),
    p_sensitive_request_ciphertext, 'in_progress', now(), now()
  ) returning * into v_attempt;

  update public.payments
  set next_reconcile_at = now() + interval '2 minutes',
      reconcile_lease_until = null,
      reconcile_lease_token = null,
      last_reconcile_error = null,
      updated_at = now()
  where id = v_payment.id;

  if v_order.status in ('paid', 'waiting_for_deposit', 'payment_auth_started', 'partially_canceled') then
    update public.orders set status = 'cancel_requested', updated_at = now() where id = v_order.id;
  end if;
  insert into public.order_events (order_id, actor_user_id, event_type, from_status, to_status, payload_json)
  values (
    v_order.id, p_actor_user_id, 'payment_cancel_claimed', v_order.status,
    case when v_order.status in ('paid', 'waiting_for_deposit', 'payment_auth_started', 'partially_canceled') then 'cancel_requested' else v_order.status end,
    jsonb_build_object('attemptId', v_attempt.id)
  );

  return private.payment_operation_payload(v_order.id) || jsonb_build_object(
    'duplicate', false,
    'paymentKey', v_payment.toss_payment_key,
    'canceledAmountBefore', v_payment.canceled_amount,
    'cancelAmount', v_cancel_amount,
    'localOnly', v_local_only,
    'refundAccountRequired', v_requires_refund_account,
    'idempotencyKey', p_idempotency_key
  );
end;
$$;
