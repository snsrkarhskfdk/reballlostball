-- Automatic payment reconciliation scheduler.
--
-- The scheduler credential lives only in Supabase Vault. The cron command reads the
-- decrypted value at execution time and sends it to the reconcile-payments Edge Function;
-- the Edge Function validates only its SHA-256 digest through a service-role-only RPC.
-- No scheduler secret is stored in Git, cron.job, browser code, or application logs.

create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'reball_payment_reconcile_scheduler'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(48), 'hex'),
      'reball_payment_reconcile_scheduler',
      'REBALL LOSTBALL payment reconciliation scheduler credential'
    );
  end if;
end
$$;

create or replace function public.payment_reconcile_scheduler_secret_hash_v1()
returns text
language sql
security definer
set search_path = ''
as $$
  select encode(extensions.digest(decrypted_secret, 'sha256'), 'hex')
  from vault.decrypted_secrets
  where name = 'reball_payment_reconcile_scheduler'
  order by updated_at desc
  limit 1
$$;

revoke all on function public.payment_reconcile_scheduler_secret_hash_v1() from public, anon, authenticated;
grant execute on function public.payment_reconcile_scheduler_secret_hash_v1() to service_role;

-- cron.schedule replaces an existing job with the same name, so replaying this migration's
-- scheduling statement is idempotent from an operational perspective.
select cron.schedule(
  'reball-payment-reconciliation',
  '*/2 * * * *',
  $cron$
    select net.http_post(
      url := 'https://qbftalhhyfcndanrcwpy.supabase.co/functions/v1/reconcile-payments',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-reball-reconcile-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'reball_payment_reconcile_scheduler'
          order by updated_at desc
          limit 1
        )
      ),
      body := jsonb_build_object('limit', 25),
      timeout_milliseconds := 30000
    ) as request_id;
  $cron$
);