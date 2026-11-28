-- ASTRA-P2-6: consume_edge_rate_limit_v1 inserted a missing bucket with no conflict
-- handling. `select ... for update` cannot lock a row that does not exist yet, so two
-- concurrent first requests for the same scope/key both attempted the insert and the
-- loser raised 23505. _shared/supabase.ts maps 23505 to HTTP 409, so a caller was
-- rejected before CAPTCHA even though the bucket had quota to spare.
--
-- Replaces the function in place; the table, grants and revokes are unchanged.
create or replace function public.consume_edge_rate_limit_v1(
  p_scope text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.edge_rate_limits%rowtype;
  v_now timestamptz := clock_timestamp();
  v_retry_after integer := 0;
  v_allowed boolean := true;
begin
  if p_scope !~ '^[a-z0-9:_-]{1,80}$'
     or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit < 1 or p_limit > 10000
     or p_window_seconds < 1 or p_window_seconds > 604800
     or p_block_seconds < 1 or p_block_seconds > 604800 then
    raise exception using errcode = '22023', message = 'invalid rate-limit arguments';
  end if;

  select * into v_row
  from private.edge_rate_limits
  where scope = p_scope and key_hash = p_key_hash
  for update;

  if not found then
    -- A `for update` on a row that does not exist locks nothing, so two concurrent
    -- first requests for the same bucket both arrive here. Without conflict handling
    -- the loser raised 23505, which the Edge layer surfaced as HTTP 409 and aborted
    -- the request before CAPTCHA ran -- a spurious rejection despite free quota, and
    -- more likely now that each auth endpoint consumes a pre-CAPTCHA bucket too.
    -- Losing the race simply means the bucket already exists, so count this hit.
    insert into private.edge_rate_limits as r (
      scope, key_hash, window_started_at, hit_count, blocked_until, updated_at
    ) values (
      p_scope, p_key_hash, v_now, 1, null, v_now
    )
    on conflict (scope, key_hash) do update
    set hit_count = r.hit_count + 1,
        blocked_until = case
          when r.hit_count + 1 > p_limit then v_now + make_interval(secs => p_block_seconds)
          else r.blocked_until
        end,
        updated_at = v_now
    returning * into v_row;

    if v_row.hit_count > p_limit then
      v_allowed := false;
      v_retry_after := greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer);
    end if;
  elsif v_row.blocked_until is not null and v_row.blocked_until > v_now then
    v_allowed := false;
    v_retry_after := greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer);
    update private.edge_rate_limits
    set updated_at = v_now
    where scope = p_scope and key_hash = p_key_hash;
  elsif v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now then
    update private.edge_rate_limits
    set window_started_at = v_now,
        hit_count = 1,
        blocked_until = null,
        updated_at = v_now
    where scope = p_scope and key_hash = p_key_hash
    returning * into v_row;
  else
    update private.edge_rate_limits
    set hit_count = hit_count + 1,
        blocked_until = case
          when hit_count + 1 > p_limit then v_now + make_interval(secs => p_block_seconds)
          else null
        end,
        updated_at = v_now
    where scope = p_scope and key_hash = p_key_hash
    returning * into v_row;

    if v_row.hit_count > p_limit then
      v_allowed := false;
      v_retry_after := greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer);
    end if;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'retryAfter', v_retry_after,
    'remaining', greatest(0, p_limit - v_row.hit_count)
  );
end;
$$;
