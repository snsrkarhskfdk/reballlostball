-- Reball admin console V3 closure.
-- Ports the missing operational areas onto the stronger service-mediated V2 baseline.
-- High-risk writes stay behind service-role-only RPCs with actor-role checks and audit logs.

alter table public.product_variants
  add column if not exists low_stock_threshold integer not null default 5;

alter table public.product_variants
  drop constraint if exists product_variants_low_stock_threshold_check;
alter table public.product_variants
  add constraint product_variants_low_stock_threshold_check
  check (low_stock_threshold between 0 and 9999) not valid;

create table if not exists public.customer_inquiries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid null references public.profiles(id) on delete set null,
  guest_name text null,
  guest_email text null,
  guest_phone text null,
  category text not null default 'general',
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open','replied','closed')),
  admin_reply text null,
  replied_by uuid null references auth.users(id) on delete set null,
  replied_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customer_inquiries_status_created_idx
  on public.customer_inquiries(status, created_at desc);
alter table public.customer_inquiries enable row level security;

drop policy if exists customer_inquiries_self_select on public.customer_inquiries;
create policy customer_inquiries_self_select on public.customer_inquiries
for select to authenticated
using (
  profile_id = auth.uid()
  or private.has_role('cs_manager')
  or private.has_role('store_manager')
  or private.has_role('owner_admin')
);

drop policy if exists customer_inquiries_self_insert on public.customer_inquiries;
create policy customer_inquiries_self_insert on public.customer_inquiries
for insert to authenticated
with check (profile_id = auth.uid());

create table if not exists public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  request_type text not null check (request_type in ('cancel','return','exchange')),
  reason text not null,
  status text not null default 'requested' check (status in ('requested','approved','rejected','completed')),
  resolution_note text null,
  requested_by uuid null references auth.users(id) on delete set null,
  handled_by uuid null references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  handled_at timestamptz null,
  updated_at timestamptz not null default now()
);
create index if not exists return_requests_order_id_idx on public.return_requests(order_id);
create index if not exists return_requests_status_requested_idx on public.return_requests(status, requested_at desc);
alter table public.return_requests enable row level security;

drop policy if exists return_requests_self_or_admin_select on public.return_requests;
create policy return_requests_self_or_admin_select on public.return_requests
for select to authenticated
using (
  private.has_role('cs_manager')
  or private.has_role('store_manager')
  or private.has_role('payments_manager')
  or private.has_role('owner_admin')
  or exists (
    select 1 from public.orders o
    where o.id = return_requests.order_id and o.profile_id = auth.uid()
  )
);

drop policy if exists return_requests_self_insert on public.return_requests;
create policy return_requests_self_insert on public.return_requests
for insert to authenticated
with check (
  exists (
    select 1 from public.orders o
    where o.id = return_requests.order_id and o.profile_id = auth.uid()
  )
);

create table if not exists public.pos_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text null,
  status text not null default 'offline' check (status in ('online','offline','maintenance')),
  note text null,
  last_seen_at timestamptz null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pos_devices enable row level security;

drop policy if exists pos_devices_ops_select on public.pos_devices;
create policy pos_devices_ops_select on public.pos_devices
for select to authenticated
using (private.has_role('store_manager') or private.has_role('owner_admin'));

-- Close the concurrent-last-owner race in the V2 role mutation.
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
  if p_actor_user_id is null or not private.user_has_role(p_actor_user_id,'owner_admin') then
    raise exception using errcode='42501', message='owner admin required';
  end if;
  if p_target_user_id is null or v_role not in ('customer','cs_manager','inventory_manager','payments_manager','store_manager','owner_admin') then
    raise exception using errcode='22023', message='invalid role';
  end if;
  if not exists(select 1 from public.profiles where id=p_target_user_id) then
    raise exception using errcode='P0002', message='profile not found';
  end if;

  -- Serializes owner role removal so two concurrent requests cannot remove the last owner.
  if v_role='owner_admin' and not p_enabled then
    perform pg_advisory_xact_lock(hashtextextended('reball-admin:last-owner', 0));
  end if;

  select coalesce(jsonb_agg(role order by role),'[]'::jsonb)
    into v_before from public.user_roles where user_id=p_target_user_id;

  if p_enabled then
    insert into public.user_roles(user_id,role)
    values(p_target_user_id,v_role)
    on conflict do nothing;
  else
    if v_role='owner_admin' then
      select count(*) into v_owner_count from public.user_roles where role='owner_admin';
      if v_owner_count<=1 and exists(
        select 1 from public.user_roles
        where user_id=p_target_user_id and role='owner_admin'
      ) then
        raise exception using errcode='22023', message='cannot remove last owner admin';
      end if;
    end if;
    delete from public.user_roles where user_id=p_target_user_id and role=v_role;
  end if;

  select coalesce(jsonb_agg(role order by role),'[]'::jsonb)
    into v_after from public.user_roles where user_id=p_target_user_id;
  insert into public.admin_audit_logs(actor_user_id,action,table_name,row_pk,old_data,new_data)
  values(
    p_actor_user_id,'user_role_update','user_roles',p_target_user_id::text,
    jsonb_build_object('roles',v_before),jsonb_build_object('roles',v_after)
  );
  return jsonb_build_object('userId',p_target_user_id,'roles',v_after);
end;
$function$;
revoke all on function public.admin_set_user_role_v2(uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.admin_set_user_role_v2(uuid,uuid,text,boolean) to service_role;

create or replace function public.admin_ops_mutation_v1(
  p_actor_user_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_action text := btrim(coalesce(p_action,''));
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_id uuid;
  v_order_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_brand_id uuid;
  v_name text;
  v_slug text;
  v_subject text;
  v_body text;
  v_reason text;
  v_type text;
  v_status text;
  v_role_ok boolean := false;
  v_price integer;
  v_stock integer;
  v_pack integer;
  v_threshold integer;
  v_value integer;
  v_sort integer;
  v_old jsonb;
  v_new jsonb;
  v_href text;
  v_image text;
begin
  if p_actor_user_id is null or not exists(select 1 from auth.users where id=p_actor_user_id) then
    raise exception using errcode='42501', message='admin actor required';
  end if;

  if v_action='product_create' then
    v_role_ok := private.user_has_role(p_actor_user_id,'inventory_manager') or private.user_has_role(p_actor_user_id,'owner_admin');
    if not v_role_ok then raise exception using errcode='42501', message='inventory admin required'; end if;
    if coalesce(v_payload->>'brandId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023', message='invalid brand';
    end if;
    v_brand_id := (v_payload->>'brandId')::uuid;
    if not exists(select 1 from public.brands where id=v_brand_id and active) then
      raise exception using errcode='22023', message='brand not found';
    end if;
    v_name := btrim(coalesce(v_payload->>'name',''));
    v_slug := lower(btrim(coalesce(v_payload->>'slug','')));
    v_price := nullif(v_payload->>'priceKrw','')::integer;
    v_stock := coalesce(nullif(v_payload->>'stockQty','')::integer,0);
    v_pack := nullif(v_payload->>'packSize','')::integer;
    v_threshold := coalesce(nullif(v_payload->>'lowStockThreshold','')::integer,5);
    if length(v_name) not between 1 and 120 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       or v_price is null or v_price < 1 or v_pack is null or v_pack < 1
       or v_stock not between 0 and 999999 or v_threshold not between 0 and 9999
       or btrim(coalesce(v_payload->>'sku',''))='' or length(v_payload->>'sku')>100
       or coalesce(v_payload->>'grade','') not in ('S','A_PLUS','A','B') then
      raise exception using errcode='22023', message='invalid product payload';
    end if;
    insert into public.products(
      brand_id,slug,name,subtitle,summary,sale_type,base_price_krw,featured,active,created_at,updated_at
    ) values (
      v_brand_id,v_slug,v_name,nullif(btrim(v_payload->>'subtitle'),''),nullif(btrim(v_payload->>'summary'),''),
      'lostball',v_price,false,true,now(),now()
    ) returning id into v_product_id;
    insert into public.product_variants(
      product_id,sku,option_model,option_color,option_design,grade,pack_size,price_krw,stock_qty,active,low_stock_threshold
    ) values (
      v_product_id,btrim(v_payload->>'sku'),nullif(btrim(v_payload->>'model'),''),nullif(btrim(v_payload->>'color'),''),
      nullif(btrim(v_payload->>'design'),''),(v_payload->>'grade')::public.ball_grade,v_pack,v_price,v_stock,true,v_threshold
    ) returning id into v_variant_id;
    insert into public.admin_audit_logs(actor_user_id,action,table_name,row_pk,old_data,new_data)
    values(
      p_actor_user_id,'product_create','products',v_product_id::text,null,
      jsonb_build_object('productId',v_product_id,'variantId',v_variant_id,'name',v_name,'slug',v_slug)
    );
    return jsonb_build_object('productId',v_product_id,'variantId',v_variant_id);
  end if;

  if v_action='threshold_set' then
    v_role_ok := private.user_has_role(p_actor_user_id,'inventory_manager') or private.user_has_role(p_actor_user_id,'store_manager') or private.user_has_role(p_actor_user_id,'owner_admin');
    if not v_role_ok then raise exception using errcode='42501', message='product admin required'; end if;
    if coalesce(v_payload->>'variantId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='invalid variant';end if;
    v_variant_id := (v_payload->>'variantId')::uuid;
    v_threshold := nullif(v_payload->>'lowStockThreshold','')::integer;
    if v_threshold is null or v_threshold not between 0 and 9999 then raise exception using errcode='22023',message='invalid threshold';end if;
    select to_jsonb(t) into v_old from public.product_variants t where id=v_variant_id;
    if v_old is null then raise exception using errcode='P0002',message='variant not found';end if;
    update public.product_variants set low_stock_threshold=v_threshold where id=v_variant_id;
    select to_jsonb(t) into v_new from public.product_variants t where id=v_variant_id;
    insert into public.admin_audit_logs(actor_user_id,action,table_name,row_pk,old_data,new_data)
    values(p_actor_user_id,'low_stock_threshold_update','product_variants',v_variant_id::text,v_old,v_new);
    return jsonb_build_object('variantId',v_variant_id,'lowStockThreshold',v_threshold);
  end if;

  if v_action='return_create' then
    v_role_ok := private.user_has_role(p_actor_user_id,'cs_manager') or private.user_has_role(p_actor_user_id,'store_manager') or private.user_has_role(p_actor_user_id,'payments_manager') or private.user_has_role(p_actor_user_id,'owner_admin');
    if not v_role_ok then raise exception using errcode='42501',message='order admin required';end if;
    if coalesce(v_payload->>'orderId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='invalid order';end if;
    v_order_id := (v_payload->>'orderId')::uuid;
    if not exists(select 1 from public.orders where id=v_order_id) then raise exception using errcode='P0002',message='order not found';end if;
    v_type := btrim(coalesce(v_payload->>'requestType',''));
    v_reason := btrim(coalesce(v_payload->>'reason',''));
    if v_type not in ('cancel','return','exchange') or length(v_reason) not between 2 and 1000 then raise exception using errcode='22023',message='invalid return request';end if;
    insert into public.return_requests(order_id,request_type,reason,requested_by)
    values(v_order_id,v_type,v_reason,p_actor_user_id) returning id into v_id;
    select to_jsonb(t) into v_new from public.return_requests t where id=v_id;
    insert into public.admin_audit_logs(actor_user_id,action,table_name,row_pk,old_data,new_data)
    values(p_actor_user_id,'return_request_create','return_requests',v_id::text,null,v_new);
    return jsonb_build_object('id',v_id);
  end if;

  if v_action='return_status' then
    v_role_ok := private.user_has_role(p_actor_user_id,'cs_manager') or private.user_has_role(p_actor_user_id,'store_manager') or private.user_has_role(p_actor_user_id,'payments_manager') or private.user_has_role(p_actor_user_id,'owner_admin');
    if not v_role_ok then raise exception using errcode='42501',message='order admin required';end if;
    if coalesce(v_payload->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='invalid request';end if;
    v_id := (v_payload->>'id')::uuid;
    v_status := btrim(coalesce(v_payload->>'status',''));
    if v_status not in ('requested','approved','rejected','completed') then raise exception using errcode='22023',message='invalid return status';end if;
    select to_jsonb(t) into v_old from public.return_requests t where id=v_id for update;
    if v_old is null then raise exception using errcode='P0002',message='return request not found';end if;
    update public.return_requests set status=v_status,resolution_note=nullif(btrim(v_payload->>'resolutionNote'),''),handled_by=p_actor_user_id,handled_at=case when v_status='requested' then null else now() end,updated_at=now() where id=v_id;
    select to_jsonb(t) into v_new from public.return_requests t where id=v_id;
    insert into public.admin_audit_logs(actor_user_id,action,table_name,row_pk,old_data,new_data)
    values(p_actor_user_id,'return_status_update','return_requests',v_id::text,v_old,v_new);
    return jsonb_build_object('id',v_id,'status',v_status);
  end if;

  if v_action='inquiry_create' then
    v_role_ok := private.user_has_role(p_actor_user_id,'cs_manager') or private.user_has_role(p_actor_user_id,'store_manager') or private.user_has_role(p_actor_user_id,'owner_admin');
    if not v_role_ok then raise exception using errcode='42501',message='cs admin required';end if;
    v_subject := btrim(coalesce(v_payload->>'subject','')); v_body := btrim(coalesce(v_payload->>'body',''));
    if length(v_subject) not between 1 and 200 or length(v_body) not between 1 and 10000 then raise exception using errcode='22023',message='invalid inquiry';end if;
    insert into public.customer_inquiries(guest_name,guest_email,guest_phone,category,subject,body)
    values(
      nullif(btrim(v_payload->>'guestName'),''),nullif(lower(btrim(v_payload->>'guestEmail')),''),nullif(btrim(v_payload->>'guestPhone'),''),
      left(coalesce(nullif(btrim(v_payload->>'category'),''),'general'),60),v_subject,v_body
    ) returning id into v_id;
    select to_jsonb(t) into v_new from public.customer_inquiries t where id=v_id;
    insert into public.admin_audit_logs(actor_user_id,action,table_name,row_pk,old_data,new_data)
    values(p_actor_user_id,'inquiry_create','customer_inquiries',v_id::text,null,v_new);
    return jsonb_build_object('id',v_id);
  end if;

  if v_action in ('inquiry_reply','inquiry_close') then
    v_role_ok := private.user_has_role(p_actor_user_id,'cs_manager') or private.user_has_role(p_actor_user_id,'store_manager') or private.user_has_role(p_actor_user_id,'owner_admin');
    if not v_role_ok then raise exception using errcode='42501',message='cs admin required';end if;
    if coalesce(v_payload->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='invalid inquiry';end if;
    v_id := (v_payload->>'id')::uuid;
    select to_jsonb(t) into v_old from public.customer_inquiries t where id=v_id for update;
    if v_old is null then raise exception using errcode='P0002',message='inquiry not found';end if;
    if v_action='inquiry_reply' then
      v_body := btrim(coalesce(v_payload->>'reply',''));
      if length(v_body) not between 1 and 10000 then raise exception using errcode='22023',message='invalid reply';end if;
      update public.customer_inquiries set admin_reply=v_body,status='replied',replied_by=p_actor_user_id,replied_at=now(),updated_at=now() where id=v_id;
    else
      update public.customer_inquiries set status='closed',updated_at=now() where id=v_id;
    end if;
    select to_jsonb(t) into v_new from public.customer_inquiries t where id=v_id;
    insert into public.admin_audit_logs(actor_user_id,action,table_name,row_pk,old_data,new_data)
    values(p_actor_user_id,v_action,'customer_inquiries',v_id::text,v_old,v_new);
    return jsonb_build_object('id',v_id,'status',v_new->>'status');
  end if;

  if v_action='benefit_create' then
    v_role_ok := private.user_has_role(p_actor_user_id,'payments_manager') or private.user_has_role(p_actor_user_id,'owner_admin');
    if not v_role_ok then raise exception using errcode='42501',message='payments admin required';end if;
    v_name := btrim(coalesce(v_payload->>'name','')); v_type := btrim(coalesce(v_payload->>'benefitType','')); v_value := nullif(v_payload->>'benefitValue','')::integer;
    if length(v_name) not between 1 and 160 or v_type not in ('point','coupon','grade_credit','discount') or v_value is null or v_value not between 0 and 100000000 then raise exception using errcode='22023',message='invalid benefit';end if;
    insert into public.benefit_policies(name,applies_to,benefit_type,benefit_value,is_active)
    values(v_name,left(coalesce(nullif(btrim(v_payload->>'appliesTo'),''),'order'),60),v_type,v_value,false) returning id into v_id;
    select to_jsonb(t) into v_new from public.benefit_policies t where id=v_id;
    insert into public.admin_audit_logs(actor_user_id,action,table_name,row_pk,old_data,new_data)
    values(p_actor_user_id,'benefit_create','benefit_policies',v_id::text,null,v_new);
    return jsonb_build_object('id',v_id);
  end if;

  if v_action='benefit_toggle' then
    v_role_ok := private.user_has_role(p_actor_user_id,'payments_manager') or private.user_has_role(p_actor_user_id,'owner_admin');
    if not v_role_ok then raise exception using errcode='42501',message='payments admin required';end if;
    if coalesce(v_payload->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='invalid benefit';end if;
    v_id := (v_payload->>'id')::uuid; select to_jsonb(t) into v_old from public.benefit_policies t where id=v_id for update;
    if v_old is null then raise exception using errcode='P0002',message='benefit not found';end if;
    update public.benefit_policies set is_active=not coalesce((v_old->>'is_active')::boolean,false) where id=v_id;
    select to_jsonb(t) into v_new from public.benefit_policies t where id=v_id;
    insert into public.admin_audit_logs(actor_user_id,action,table_name,row_pk,old_data,new_data) values(p_actor_user_id,'benefit_toggle','benefit_policies',v_id::text,v_old,v_new);
    return jsonb_build_object('id',v_id,'active',(v_new->>'is_active')::boolean);
  end if;

  if v_action='banner_create' then
    if not private.user_has_role(p_actor_user_id,'owner_admin') then raise exception using errcode='42501',message='owner admin required';end if;
    v_name := btrim(coalesce(v_payload->>'title','')); v_href := btrim(coalesce(v_payload->>'href','')); v_image := btrim(coalesce(v_payload->>'imageUrl','')); v_sort := coalesce(nullif(v_payload->>'sortOrder','')::integer,100);
    if length(v_name) not between 1 and 200 or v_sort not between -9999 and 9999 then raise exception using errcode='22023',message='invalid banner';end if;
    if v_href<>'' and v_href !~ '^(/|https://)' then raise exception using errcode='22023',message='unsafe banner href';end if;
    if v_image<>'' and v_image !~ '^(/|https://)' then raise exception using errcode='22023',message='unsafe banner image';end if;
    insert into public.banners(title,subtitle,image_url,href,active,sort_order)
    values(v_name,nullif(btrim(v_payload->>'subtitle'),''),nullif(v_image,''),nullif(v_href,''),false,v_sort) returning id into v_id;
    select to_jsonb(t) into v_new from public.banners t where id=v_id;
    insert into public.admin_audit_logs(actor_user_id,action,table_name,row_pk,old_data,new_data) values(p_actor_user_id,'banner_create','banners',v_id::text,null,v_new);
    return jsonb_build_object('id',v_id);
  end if;

  if v_action='banner_toggle' then
    if not private.user_has_role(p_actor_user_id,'owner_admin') then raise exception using errcode='42501',message='owner admin required';end if;
    if coalesce(v_payload->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='invalid banner';end if;
    v_id := (v_payload->>'id')::uuid; select to_jsonb(t) into v_old from public.banners t where id=v_id for update;
    if v_old is null then raise exception using errcode='P0002',message='banner not found';end if;
    update public.banners set active=not coalesce((v_old->>'active')::boolean,false) where id=v_id;
    select to_jsonb(t) into v_new from public.banners t where id=v_id;
    insert into public.admin_audit_logs(actor_user_id,action,table_name,row_pk,old_data,new_data) values(p_actor_user_id,'banner_toggle','banners',v_id::text,v_old,v_new);
    return jsonb_build_object('id',v_id,'active',(v_new->>'active')::boolean);
  end if;

  if v_action='pos_create' then
    v_role_ok := private.user_has_role(p_actor_user_id,'store_manager') or private.user_has_role(p_actor_user_id,'owner_admin');
    if not v_role_ok then raise exception using errcode='42501',message='store admin required';end if;
    v_name := btrim(coalesce(v_payload->>'name',''));
    if length(v_name) not between 1 and 120 then raise exception using errcode='22023',message='invalid pos name';end if;
    insert into public.pos_devices(name,location,status,note)
    values(v_name,nullif(btrim(v_payload->>'location'),''),'offline',nullif(btrim(v_payload->>'note'),'')) returning id into v_id;
    select to_jsonb(t) into v_new from public.pos_devices t where id=v_id;
    insert into public.admin_audit_logs(actor_user_id,action,table_name,row_pk,old_data,new_data) values(p_actor_user_id,'pos_create','pos_devices',v_id::text,null,v_new);
    return jsonb_build_object('id',v_id);
  end if;

  if v_action='pos_status' then
    v_role_ok := private.user_has_role(p_actor_user_id,'store_manager') or private.user_has_role(p_actor_user_id,'owner_admin');
    if not v_role_ok then raise exception using errcode='42501',message='store admin required';end if;
    if coalesce(v_payload->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='invalid pos';end if;
    v_id := (v_payload->>'id')::uuid; v_status := btrim(coalesce(v_payload->>'status',''));
    if v_status not in ('online','offline','maintenance') then raise exception using errcode='22023',message='invalid pos status';end if;
    select to_jsonb(t) into v_old from public.pos_devices t where id=v_id for update;
    if v_old is null then raise exception using errcode='P0002',message='pos not found';end if;
    update public.pos_devices set status=v_status,last_seen_at=case when v_status='online' then now() else last_seen_at end,updated_at=now() where id=v_id;
    select to_jsonb(t) into v_new from public.pos_devices t where id=v_id;
    insert into public.admin_audit_logs(actor_user_id,action,table_name,row_pk,old_data,new_data) values(p_actor_user_id,'pos_status_update','pos_devices',v_id::text,v_old,v_new);
    return jsonb_build_object('id',v_id,'status',v_status);
  end if;

  if v_action='review_visibility' then
    v_role_ok := private.user_has_role(p_actor_user_id,'cs_manager') or private.user_has_role(p_actor_user_id,'owner_admin');
    if not v_role_ok then raise exception using errcode='42501',message='cs admin required';end if;
    if coalesce(v_payload->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception using errcode='22023',message='invalid review';end if;
    v_id := (v_payload->>'id')::uuid; select to_jsonb(t) into v_old from public.reviews t where id=v_id for update;
    if v_old is null then raise exception using errcode='P0002',message='review not found';end if;
    update public.reviews set visible=coalesce((v_payload->>'visible')::boolean,not coalesce((v_old->>'visible')::boolean,false)) where id=v_id;
    select to_jsonb(t) into v_new from public.reviews t where id=v_id;
    insert into public.admin_audit_logs(actor_user_id,action,table_name,row_pk,old_data,new_data) values(p_actor_user_id,'review_visibility_update','reviews',v_id::text,v_old,v_new);
    return jsonb_build_object('id',v_id,'visible',(v_new->>'visible')::boolean);
  end if;

  raise exception using errcode='22023', message='unsupported admin operation';
end;
$function$;

revoke all on function public.admin_ops_mutation_v1(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.admin_ops_mutation_v1(uuid,text,jsonb) to service_role;
