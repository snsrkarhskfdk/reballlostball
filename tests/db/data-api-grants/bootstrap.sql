-- Local PostgreSQL test doubles for hosted Supabase infrastructure only.
-- No Supabase keys, hosted connections, real users, scheduler workers or HTTP.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (
  id uuid primary key, email text, raw_user_meta_data jsonb default '{}',
  raw_app_meta_data jsonb default '{}'
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create schema extensions;
create extension pgcrypto with schema extensions;
set search_path = public, extensions;
-- No table/sequence default grants: this is the restrictive fresh-DB case.
create schema cron;
create table cron.job (jobname text primary key, schedule text, command text);
create function cron.schedule(text,text,text) returns bigint language plpgsql as $$
begin
  insert into cron.job values ($1,$2,$3)
  on conflict(jobname) do update set schedule=$2,command=$3;
  return 1;
end $$;
create schema vault;
create table vault.decrypted_secrets (
  id uuid primary key default gen_random_uuid(), name text,
  decrypted_secret text, updated_at timestamptz default now()
);
create function vault.create_secret(text,text,text) returns uuid language sql as $$
  insert into vault.decrypted_secrets(decrypted_secret,name) values($1,$2) returning id
$$;
-- Storage policy targets only; object IO is outside this database ACL proof.
create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint,
  allowed_mime_types text[], updated_at timestamptz
);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
