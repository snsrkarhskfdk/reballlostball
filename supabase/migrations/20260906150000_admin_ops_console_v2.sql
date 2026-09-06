-- REBALL admin operations v2
-- Keeps daily store operations narrow, makes catalog writes atomic/audited,
-- and adds owner-only settings / policy / staff role operations.

-- Store managers must use the audited, atomic RPC below instead of direct row writes.
drop policy if exists products_store_manager_update on public.products;
drop policy if exists product_variants_store_manager_update on public.product_variants;

create or replace function public.admin_catalog_update_v2(
  p_actor_user_id uuid,
  p_product_id uuid,
  p_product_patch jsonb default '{}'::jsonb,
  p_variants jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_product public.products%rowtype;
  v_old jsonb;
  v_new jsonb;
  v_item jsonb;
  v_variant public.product_variants%rowtype;
  v_is_owner boolean := false;
  v_is_inventory boolean := false;
  v_is_store boolean := false;
  v_name text;
  v_subtitle text;
  v_summary text;
  v_detail text;
  v_active boolean;
  v_price integer;
  v_stock integer;
  v_thumb text;
  v_variant_active boolean;
  v_base integer;
  v_count integer := 0;
begin
  if p_actor_user_id is null then
    raise exception using errcode = '42501', message = 'admin role required';
  end if;

  select
    private.user_has_role(p_actor_user_id, 'owner_admin'),
    private.user_has_role(p_actor_user_id, 'inventory_manager'),
    private.user_has_role(p_actor_user_id, 'store_manager')
  into v_is_owner, v_is_inventory, v_is_store;

  if not (v_is_owner or v_is_inventory or v_is_store) then
    raise exception using errcode = '42501', message = 'catalog role required';
  end if;

  if jsonb_typeof(coalesce(p_product_patch, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_variants, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid catalog payload';
  end if;

  if exists (
    select 1 from jsonb_object_keys(coalesce(p_product_patch, '{}'::jsonb)) as k(key)
    where k.key not in ('name','subtitle','summary','active','detailImageUrl')
  ) then
    raise exception using errcode = '22023', message = 'unsupported product field';
  end if;

  if v_is_store and not (v_is_owner or v_is_inventory)
     and (p_product_patch ? 'name' or p_product_patch ? 'subtitle' or p_product_patch ? 'summary') then
    raise exception using errcode = '42501', message = 'store manager metadata update denied';
  end if;

  select * into strict v_product
  from public.products
  where id = p_product_id
  for update;

  select jsonb_build_object(
    'product', to_jsonb(v_product),
    'variants', coalesce(jsonb_agg(to_jsonb(pv) order by pv.sku), '[]'::jsonb)
  ) into v_old
  from public.product_variants pv
  where pv.product_id = p_product_id;

  if p_product_patch ? 'name' then
    v_name := nullif(btrim(p_product_patch ->> 'name'), '');
    if v_name is null or length(v_name) > 160 then
      raise exception using errcode = '22023', message = 'invalid product name';
    end if;
  else
    v_name := v_product.name;
  end if;

  if p_product_patch ? 'subtitle' then
    v_subtitle := nullif(btrim(p_product_patch ->> 'subtitle'), '');
    if v_subtitle is not null and length(v_subtitle) > 240 then
      raise exception using errcode = '22023', message = 'invalid product subtitle';
    end if;
  else
    v_subtitle := v_product.subtitle;
  end if;

  if p_product_patch ? 'summary' then
    v_summary := nullif(btrim(p_product_patch ->> 'summary'), '');
    if v_summary is not null and length(v_summary) > 2000 then
      raise exception using errcode = '22023', message = 'invalid product summary';
    end if;
  else
    v_summary := v_product.summary;
  end if;

  if p_product_patch ? 'detailImageUrl' then
    v_detail := nullif(btrim(p_product_patch ->> 'detailImageUrl'), '');
    if v_detail is not null and (length(v_detail) > 1000 or v_detail !~ '^https://') then
      raise exception using errcode = '22023', message = 'invalid detail image url';
    end if;
  else
    v_detail := v_product.detail_image_url;
  end if;

  if p_product_patch ? 'active' then
    if jsonb_typeof(p_product_patch -> 'active') <> 'boolean' then
      raise exception using errcode = '22023', message = 'invalid product active flag';
    end if;
    v_active := (p_product_patch ->> 'active')::boolean;
  else
    v_active := v_product.active;
  end if;

  if jsonb_array_length(coalesce(p_variants, '[]'::jsonb)) > 200 then
    raise exception using errcode = '22023', message = 'too many variants';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb))
  loop
    v_count := v_count + 1;
    if jsonb_typeof(v_item) <> 'object' or not (v_item ? 'id') then
      raise exception using errcode = '22023', message = 'invalid variant payload';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_item) as k(key)
      where k.key not in ('id','priceKrw','stockQty','active','thumbnailUrl')
    ) then
      raise exception using errcode = '22023', message = 'unsupported variant field';
    end if;

    begin
      select * into strict v_variant
      from public.product_variants
      where id = (v_item ->> 'id')::uuid and product_id = p_product_id
      for update;
    exception when invalid_text_representation or no_data_found then
      raise exception using errcode = '22023', message = 'variant does not belong to product';
    end;

    v_price := case when v_item ? 'priceKrw' then (v_item ->> 'priceKrw')::integer else v_variant.price_krw end;
    v_stock := case when v_item ? 'stockQty' then (v_item ->> 'stockQty')::integer else v_variant.stock_qty end;
    v_variant_active := case when v_item ? 'active' then (v_item ->> 'active')::boolean else v_variant.active end;
    v_thumb := case when v_item ? 'thumbnailUrl' then nullif(btrim(v_item ->> 'thumbnailUrl'), '') else v_variant.thumbnail_url end;

    if v_price < 1 or v_price > 10000000 or v_stock < 0 or v_stock > 1000000 then
      raise exception using errcode = '22023', message = 'invalid price or stock';
    end if;
    if v_thumb is not null and (length(v_thumb) > 1000 or v_thumb !~ '^https://') then
      raise exception using errcode = '22023', message = 'invalid thumbnail url';
    end if;

    update public.product_variants
    set price_krw = v_price,
        stock_qty = v_stock,
        active = v_variant_active,
        thumbnail_url = v_thumb
    where id = v_variant.id;
  end loop;

  select min(price_krw) filter (where active), min(price_krw)
  into v_base, v_price
  from public.product_variants
  where product_id = p_product_id;
  v_base := coalesce(v_base, v_price, v_product.base_price_krw);

  update public.products
  set name = v_name,
      subtitle = v_subtitle,
      summary = v_summary,
      detail_image_url = v_detail,
      active = v_active,
      base_price_krw = v_base,
      updated_at = now()
  where id = p_product_id
  returning * into v_product;

  select jsonb_build_object(
    'product', to_jsonb(v_product),
    'variants', coalesce(jsonb_agg(to_jsonb(pv) order by pv.sku), '[]'::jsonb)
  ) into v_new
  from public.product_variants pv
  where pv.product_id = p_product_id;

  insert into public.admin_audit_logs(actor_user_id, action, table_name, row_pk, old_data, new_data)
  values (p_actor_user_id, 'catalog_batch_update', 'products', p_product_id::text, v_old, v_new);

  return v_new;
end;
$function$;

revoke all on function public.admin_catalog_update_v2(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.admin_catalog_update_v2(uuid,uuid,jsonb,jsonb) to service_role;

create or replace function public.admin_update_store_settings_v2(
  p_actor_user_id uuid,
  p_store jsonb default '{}'::jsonb,
  p_commerce jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_store public.store_profile%rowtype;
  v_old jsonb;
  v_new jsonb;
  v_base integer;
  v_free integer;
  v_remote integer;
  v_reservation integer;
  v_guest integer;
begin
  if p_actor_user_id is null or not private.user_has_role(p_actor_user_id, 'owner_admin') then
    raise exception using errcode = '42501', message = 'owner admin required';
  end if;
  if jsonb_typeof(coalesce(p_store,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_commerce,'{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid settings payload';
  end if;
  if exists (select 1 from jsonb_object_keys(coalesce(p_store,'{}'::jsonb)) k(key)
             where k.key not in ('representativeName','businessNumber','mailOrderNumber','email','phone','csPhone','addressRoad','hostingProvider','businessInfoStatus')) then
    raise exception using errcode = '22023', message = 'unsupported store setting';
  end if;
  if exists (select 1 from jsonb_object_keys(coalesce(p_commerce,'{}'::jsonb)) k(key)
             where k.key not in ('baseShippingKrw','freeShippingThresholdKrw','remoteAreaSurchargeKrw','reservationTtlMinutes','guestLookupTtlDays')) then
    raise exception using errcode = '22023', message = 'unsupported commerce setting';
  end if;

  select * into v_store from public.store_profile order by updated_at desc limit 1 for update;
  if not found then
    insert into public.store_profile default values returning * into v_store;
  end if;
  select jsonb_build_object(
    'store', to_jsonb(v_store),
    'commerce', (select to_jsonb(cs) from public.commerce_settings cs where singleton = true)
  ) into v_old;

  update public.store_profile
  set representative_name = case when p_store ? 'representativeName' then nullif(btrim(p_store->>'representativeName'),'') else representative_name end,
      business_number = case when p_store ? 'businessNumber' then nullif(btrim(p_store->>'businessNumber'),'') else business_number end,
      mail_order_number = case when p_store ? 'mailOrderNumber' then nullif(btrim(p_store->>'mailOrderNumber'),'') else mail_order_number end,
      email = case when p_store ? 'email' then nullif(btrim(p_store->>'email'),'') else email end,
      phone = case when p_store ? 'phone' then nullif(btrim(p_store->>'phone'),'') else phone end,
      cs_phone = case when p_store ? 'csPhone' then nullif(btrim(p_store->>'csPhone'),'') else cs_phone end,
      address_road = case when p_store ? 'addressRoad' then nullif(btrim(p_store->>'addressRoad'),'') else address_road end,
      hosting_provider = case when p_store ? 'hostingProvider' then nullif(btrim(p_store->>'hostingProvider'),'') else hosting_provider end,
      business_info_status = case when p_store ? 'businessInfoStatus' then coalesce(nullif(btrim(p_store->>'businessInfoStatus'),''), business_info_status) else business_info_status end,
      updated_at = now()
  where id = v_store.id
  returning * into v_store;

  select base_shipping_krw, free_shipping_threshold_krw, remote_area_surcharge_krw, reservation_ttl_minutes, guest_lookup_ttl_days
  into v_base, v_free, v_remote, v_reservation, v_guest
  from public.commerce_settings where singleton = true for update;

  v_base := case when p_commerce ? 'baseShippingKrw' then (p_commerce->>'baseShippingKrw')::integer else v_base end;
  v_free := case when p_commerce ? 'freeShippingThresholdKrw' then (p_commerce->>'freeShippingThresholdKrw')::integer else v_free end;
  v_remote := case when p_commerce ? 'remoteAreaSurchargeKrw' then (p_commerce->>'remoteAreaSurchargeKrw')::integer else v_remote end;
  v_reservation := case when p_commerce ? 'reservationTtlMinutes' then (p_commerce->>'reservationTtlMinutes')::integer else v_reservation end;
  v_guest := case when p_commerce ? 'guestLookupTtlDays' then (p_commerce->>'guestLookupTtlDays')::integer else v_guest end;

  if v_base not between 0 and 100000 or v_free not between 0 and 10000000 or v_remote not between 0 and 100000
     or v_reservation not between 5 and 240 or v_guest not between 1 and 3650 then
    raise exception using errcode = '22023', message = 'invalid commerce setting';
  end if;

  update public.commerce_settings
  set base_shipping_krw = v_base,
      free_shipping_threshold_krw = v_free,
      remote_area_surcharge_krw = v_remote,
      reservation_ttl_minutes = v_reservation,
      guest_lookup_ttl_days = v_guest,
      updated_at = now()
  where singleton = true;

  select jsonb_build_object(
    'store', to_jsonb(v_store),
    'commerce', (select to_jsonb(cs) from public.commerce_settings cs where singleton = true)
  ) into v_new;

  insert into public.admin_audit_logs(actor_user_id, action, table_name, row_pk, old_data, new_data)
  values (p_actor_user_id, 'store_settings_update', 'store_profile', v_store.id::text, v_old, v_new);
  return v_new;
end;
$function$;

revoke all on function public.admin_update_store_settings_v2(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_store_settings_v2(uuid,jsonb,jsonb) to service_role;

create or replace function public.admin_save_policy_v2(
  p_actor_user_id uuid,
  p_slug text,
  p_title text,
  p_body_md text,
  p_effective_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_slug text := lower(btrim(coalesce(p_slug,'')));
  v_title text := btrim(coalesce(p_title,''));
  v_body text := coalesce(p_body_md,'');
  v_row public.policy_versions%rowtype;
  v_old jsonb;
begin
  if p_actor_user_id is null or not private.user_has_role(p_actor_user_id, 'owner_admin') then
    raise exception using errcode = '42501', message = 'owner admin required';
  end if;
  if v_slug !~ '^[a-z0-9][a-z0-9_-]{1,60}$' or length(v_title) not between 2 and 160 or length(v_body) not between 1 and 100000 then
    raise exception using errcode = '22023', message = 'invalid policy';
  end if;
  select coalesce(jsonb_agg(to_jsonb(pv) order by pv.created_at desc), '[]'::jsonb)
  into v_old from public.policy_versions pv where slug = v_slug and active = true;

  update public.policy_versions set active = false where slug = v_slug and active = true;
  insert into public.policy_versions(slug,title,body_md,effective_at,active)
  values (v_slug,v_title,v_body,coalesce(p_effective_at,now()),true)
  returning * into v_row;

  insert into public.admin_audit_logs(actor_user_id, action, table_name, row_pk, old_data, new_data)
  values (p_actor_user_id, 'policy_publish', 'policy_versions', v_row.id::text, v_old, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$function$;

revoke all on function public.admin_save_policy_v2(uuid,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.admin_save_policy_v2(uuid,text,text,text,timestamptz) to service_role;

create or replace function public.admin_set_user_role_v2(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_role text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := btrim(coalesce(p_role,''));
  v_before jsonb;
  v_after jsonb;
  v_owner_count integer;
begin
  if p_actor_user_id is null or not private.user_has_role(p_actor_user_id, 'owner_admin') then
    raise exception using errcode = '42501', message = 'owner admin required';
  end if;
  if p_target_user_id is null or v_role not in ('customer','cs_manager','inventory_manager','payments_manager','store_manager','owner_admin') then
    raise exception using errcode = '22023', message = 'invalid role';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_user_id) then
    raise exception using errcode = 'P0002', message = 'profile not found';
  end if;

  select coalesce(jsonb_agg(role order by role), '[]'::jsonb) into v_before
  from public.user_roles where user_id = p_target_user_id;

  if p_enabled then
    insert into public.user_roles(user_id,role) values (p_target_user_id,v_role)
    on conflict do nothing;
  else
    if v_role = 'owner_admin' then
      select count(*) into v_owner_count from public.user_roles where role = 'owner_admin';
      if v_owner_count <= 1 and exists(select 1 from public.user_roles where user_id=p_target_user_id and role='owner_admin') then
        raise exception using errcode = '22023', message = 'cannot remove last owner admin';
      end if;
    end if;
    delete from public.user_roles where user_id = p_target_user_id and role = v_role;
  end if;

  select coalesce(jsonb_agg(role order by role), '[]'::jsonb) into v_after
  from public.user_roles where user_id = p_target_user_id;

  insert into public.admin_audit_logs(actor_user_id, action, table_name, row_pk, old_data, new_data)
  values (p_actor_user_id, 'user_role_update', 'user_roles', p_target_user_id::text,
          jsonb_build_object('roles',v_before), jsonb_build_object('roles',v_after));
  return jsonb_build_object('userId',p_target_user_id,'roles',v_after);
end;
$function$;

revoke all on function public.admin_set_user_role_v2(uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.admin_set_user_role_v2(uuid,uuid,text,boolean) to service_role;

create or replace function public.admin_add_order_note_v1(
  p_actor_user_id uuid,
  p_order_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.orders%rowtype;
  v_note text := btrim(coalesce(p_note,''));
begin
  if p_actor_user_id is null or not exists (
    select 1 from public.user_roles where user_id=p_actor_user_id
      and role in ('owner_admin','cs_manager','store_manager','payments_manager')
  ) then
    raise exception using errcode = '42501', message = 'admin role required';
  end if;
  if length(v_note) not between 1 and 1000 then
    raise exception using errcode = '22023', message = 'invalid note';
  end if;
  select * into strict v_order from public.orders where id=p_order_id;
  insert into public.order_events(order_id,actor_user_id,event_type,from_status,to_status,payload_json)
  values(p_order_id,p_actor_user_id,'admin_note',v_order.status,v_order.status,jsonb_build_object('note',v_note));
  return jsonb_build_object('orderId',p_order_id,'note',v_note,'createdAt',now());
end;
$function$;

revoke all on function public.admin_add_order_note_v1(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_add_order_note_v1(uuid,uuid,text) to service_role;
