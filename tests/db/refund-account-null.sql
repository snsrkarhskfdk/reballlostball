-- Execute ONLY in a freshly provisioned local ephemeral database named reball_r42_*.
-- Example: psql -X -v ON_ERROR_STOP=1 -d reball_r42_red -f tests/db/refund-account-null.sql
-- Applies no migrations. The caller must install the exact baseline first, then
-- rerun unchanged against the proposed migration and the source-only mutant.
begin;
do $$ begin
  if current_database() !~ '^reball_r42_' then
    raise exception 'Test requires an isolated reball_r42_* database';
  end if;
end $$;

select pg_get_functiondef('public.claim_payment_cancellation_v1(text,uuid,text,text,text,text,text)'::regprocedure);

create temporary table refund_case_results (
  label text, expected_sqlstate text, actual_sqlstate text, message text,
  attempt_rows bigint, persisted_ciphertext text, order_status text,
  returned_refund_required boolean, duplicate_replayed boolean
) on commit drop;

create function pg_temp.refund_case(
  label text, method text, payment_status text, ciphertext text, expected text
) returns void language plpgsql as $$
declare
  v_order_id uuid;
  order_number text := 'R42-NULL-' || label;
  token_hash text := md5(label) || md5('token-' || label);
  request_hash text := md5('request-' || label) || md5(label);
  result jsonb;
  replay jsonb;
  observed_state text := '00000';
  observed_message text := '';
begin
  insert into public.orders (
    profile_id, order_no, status, payment_status, payment_provider, payment_method,
    subtotal_krw, shipping_krw, discount_krw, total_krw, address_snapshot,
    guest_lookup_token_hash, guest_lookup_expires_at
  ) values (
    null, order_number,
    (case when payment_status = 'ready' then 'payment_ready' else 'paid' end)::public.order_status,
    payment_status::public.payment_status, 'toss_payments', method::public.payment_method,
    10000, 0, 0, 10000, '{}', token_hash, now() + interval '1 day'
  ) returning id into v_order_id;
  insert into public.payments (
    order_id, provider, status, requested_amount, approved_amount,
    canceled_amount, raw_response_json, toss_payment_key
  ) values (
    v_order_id, 'toss_payments', payment_status::public.payment_status, 10000, 10000, 0, '{}',
    case when payment_status = 'ready' then null else 'synthetic-key-' || label end
  );
  begin
    result := public.claim_payment_cancellation_v1(
      order_number, null, token_hash, 'r42-refund-idempotency-' || label,
      request_hash, 'synthetic customer request', ciphertext
    );
    replay := public.claim_payment_cancellation_v1(
      order_number, null, token_hash, 'r42-refund-idempotency-' || label,
      request_hash, 'synthetic customer request', ciphertext
    );
  exception when others then
    get stacked diagnostics observed_state = returned_sqlstate, observed_message = message_text;
  end;
  insert into refund_case_results
  select label, expected, observed_state, observed_message,
    (select count(*) from public.payment_attempts a where a.order_id = v_order_id),
    (select a.sensitive_request_ciphertext from public.payment_attempts a where a.order_id = v_order_id limit 1),
    (select o.status from public.orders o where o.id = v_order_id),
    (result ->> 'refundAccountRequired')::boolean,
    coalesce((replay ->> 'duplicate')::boolean, false);
end $$;

select pg_temp.refund_case(c.label, c.method, c.status, c.ciphertext, c.expected)
from (values
  ('NULL-done-supplied', null, 'done', 'v1.abcdefghijklmnop.abcdefghijklmnopqrstuvwx', '22023'),
  ('NULL-done-empty', null, 'done', null, '00000'),
  ('card-done-supplied', 'card', 'done', 'v1.abcdefghijklmnop.abcdefghijklmnopqrstuvwx', '22023'),
  ('card-done-empty', 'card', 'done', null, '00000'),
  ('VA-done-supplied', 'virtual_account', 'done', 'v1.abcdefghijklmnop.abcdefghijklmnopqrstuvwx', '00000'),
  ('VA-partial-supplied', 'virtual_account', 'partial_canceled', 'v1.abcdefghijklmnop.abcdefghijklmnopqrstuvwx', '00000'),
  ('VA-done-missing', 'virtual_account', 'done', null, '22023'),
  ('VA-done-malformed', 'virtual_account', 'done', 'malformed', '22023'),
  ('VA-ready-empty', 'virtual_account', 'ready', null, '00000'),
  ('VA-ready-supplied', 'virtual_account', 'ready', 'v1.abcdefghijklmnop.abcdefghijklmnopqrstuvwx', '22023')
) c(label, method, status, ciphertext, expected);

select jsonb_pretty(jsonb_agg(to_jsonb(r))) as executed_case_receipt from refund_case_results r;
do $$
declare r record;
begin
  if (select count(*) from refund_case_results) <> 10 then
    raise exception 'Harness assertion: all 10 database calls must be reached';
  end if;
  for r in select * from refund_case_results loop
    if r.actual_sqlstate <> r.expected_sqlstate then
      raise exception 'LANEB-N01 assertion reached: %, expected %, actual %, attempts %, ciphertext %',
        r.label, r.expected_sqlstate, r.actual_sqlstate, r.attempt_rows, r.persisted_ciphertext;
    end if;
    if r.expected_sqlstate = '00000' and (r.attempt_rows <> 1 or not r.duplicate_replayed) then
      raise exception 'Legitimate cancellation/replay assertion: %', r.label;
    end if;
    if r.expected_sqlstate = '22023' and r.attempt_rows <> 0 then
      raise exception 'Rejected input left a persisted attempt: %', r.label;
    end if;
  end loop;
end $$;
rollback;
