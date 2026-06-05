alter table public.profiles
  add column if not exists login_id text,
  add column if not exists auth_email text;

create unique index if not exists profiles_login_id_unique
  on public.profiles (lower(login_id))
  where login_id is not null and login_id <> '';

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_login_id text := lower(nullif(new.raw_user_meta_data ->> 'login_id', ''));
  profile_auth_email text := new.email;
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
    login_id,
    auth_email,
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
    profile_login_id,
    profile_auth_email,
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
  on conflict (id) do update
    set
      login_id = coalesce(public.profiles.login_id, excluded.login_id),
      auth_email = coalesce(public.profiles.auth_email, excluded.auth_email);

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

update public.profiles as profiles
set
  login_id = coalesce(profiles.login_id, lower(nullif(users.raw_user_meta_data ->> 'login_id', ''))),
  auth_email = coalesce(profiles.auth_email, users.email)
from auth.users as users
where profiles.id = users.id
  and (
    profiles.auth_email is null
    or (
      profiles.login_id is null
      and nullif(users.raw_user_meta_data ->> 'login_id', '') is not null
    )
  );
