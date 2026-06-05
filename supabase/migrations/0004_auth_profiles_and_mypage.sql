alter table public.profiles
  add column if not exists telephone text,
  add column if not exists birth_date text,
  add column if not exists anniversary_date text,
  add column if not exists spouse_birth_date text,
  add column if not exists region text,
  add column if not exists updated_at timestamptz not null default now();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text := nullif(new.raw_user_meta_data ->> 'name', '');
  profile_phone text := nullif(new.raw_user_meta_data ->> 'phone', '');
  profile_telephone text := nullif(new.raw_user_meta_data ->> 'telephone', '');
  profile_email text := coalesce(nullif(new.raw_user_meta_data ->> 'contact_email', ''), new.email);
  profile_provider text := coalesce(nullif(new.raw_app_meta_data ->> 'provider', ''), nullif(new.raw_user_meta_data ->> 'provider', ''), 'email');
  profile_marketing_email boolean := coalesce(nullif(new.raw_user_meta_data ->> 'marketing_email', '')::boolean, false);
  profile_marketing_sms boolean := coalesce(nullif(new.raw_user_meta_data ->> 'marketing_sms', '')::boolean, false);
  profile_birth_date text := nullif(new.raw_user_meta_data ->> 'birth_date', '');
  profile_anniversary_date text := nullif(new.raw_user_meta_data ->> 'anniversary_date', '');
  profile_spouse_birth_date text := nullif(new.raw_user_meta_data ->> 'spouse_birth_date', '');
  profile_region text := nullif(new.raw_user_meta_data ->> 'region', '');
  default_address_road text := nullif(new.raw_user_meta_data ->> 'default_address_road', '');
  default_address_detail text := nullif(new.raw_user_meta_data ->> 'default_address_detail', '');
  default_address_zip text := coalesce(nullif(new.raw_user_meta_data ->> 'default_address_zip', ''), '');
begin
  insert into public.profiles (
    id,
    name,
    phone,
    telephone,
    email,
    provider,
    marketing_email,
    marketing_sms,
    birth_date,
    anniversary_date,
    spouse_birth_date,
    region,
    updated_at
  )
  values (
    new.id,
    profile_name,
    profile_phone,
    profile_telephone,
    profile_email,
    profile_provider,
    profile_marketing_email,
    profile_marketing_sms,
    profile_birth_date,
    profile_anniversary_date,
    profile_spouse_birth_date,
    profile_region,
    now()
  )
  on conflict (id) do nothing;

  if default_address_road is not null
    and not exists (
      select 1
      from public.addresses
      where profile_id = new.id
    )
  then
    insert into public.addresses (
      profile_id,
      receiver_name,
      receiver_phone,
      zip_code,
      road_address,
      detail_address,
      is_default
    )
    values (
      new.id,
      coalesce(profile_name, new.email),
      coalesce(profile_phone, ''),
      default_address_zip,
      default_address_road,
      default_address_detail,
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure private.handle_new_user();

insert into public.profiles (
  id,
  name,
  phone,
  telephone,
  email,
  provider,
  marketing_email,
  marketing_sms,
  birth_date,
  anniversary_date,
  spouse_birth_date,
  region,
  updated_at
)
select
  users.id,
  nullif(users.raw_user_meta_data ->> 'name', ''),
  nullif(users.raw_user_meta_data ->> 'phone', ''),
  nullif(users.raw_user_meta_data ->> 'telephone', ''),
  coalesce(nullif(users.raw_user_meta_data ->> 'contact_email', ''), users.email),
  coalesce(nullif(users.raw_app_meta_data ->> 'provider', ''), nullif(users.raw_user_meta_data ->> 'provider', ''), 'email'),
  coalesce(nullif(users.raw_user_meta_data ->> 'marketing_email', '')::boolean, false),
  coalesce(nullif(users.raw_user_meta_data ->> 'marketing_sms', '')::boolean, false),
  nullif(users.raw_user_meta_data ->> 'birth_date', ''),
  nullif(users.raw_user_meta_data ->> 'anniversary_date', ''),
  nullif(users.raw_user_meta_data ->> 'spouse_birth_date', ''),
  nullif(users.raw_user_meta_data ->> 'region', ''),
  now()
from auth.users as users
where not exists (
  select 1
  from public.profiles
  where profiles.id = users.id
);

insert into public.addresses (
  profile_id,
  receiver_name,
  receiver_phone,
  zip_code,
  road_address,
  detail_address,
  is_default
)
select
  users.id,
  coalesce(nullif(users.raw_user_meta_data ->> 'name', ''), users.email),
  coalesce(nullif(users.raw_user_meta_data ->> 'phone', ''), ''),
  coalesce(nullif(users.raw_user_meta_data ->> 'default_address_zip', ''), ''),
  users.raw_user_meta_data ->> 'default_address_road',
  nullif(users.raw_user_meta_data ->> 'default_address_detail', ''),
  true
from auth.users as users
where nullif(users.raw_user_meta_data ->> 'default_address_road', '') is not null
  and not exists (
    select 1
    from public.addresses
    where addresses.profile_id = users.id
  );

drop policy if exists "profiles_self_insert" on public.profiles;

create policy "profiles_self_insert" on public.profiles
for insert to authenticated
with check ((select auth.uid()) = id);
