-- Hosted PostgreSQL proof. Only the restored, isolated R42 test project.
-- Synthetic writes and helper functions are rolled back. Never run on production.
begin;
do $$ begin if to_regnamespace('r42_archive_20261022') is null or (select count(*) from auth.users) <> 0 then raise exception 'Not the empty isolated R42 release test environment'; end if; end $$;
create temp table proof_results(label text primary key);
create function public._release_proof_assert(ok boolean, label text) returns void language plpgsql security definer set search_path='' as $$ begin if ok is distinct from true then raise exception 'ASSERTION FAILED: %', label; end if; insert into pg_temp.proof_results values(label); end $$;
create function public._release_proof_denied(statement text, label text) returns void language plpgsql security invoker set search_path='' as $$ declare denied boolean:=false; begin begin execute statement; exception when insufficient_privilege then denied:=true; end; perform public._release_proof_assert(denied,label); end $$;
create temp table boundary_before as select jsonb_build_object('policies',(select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public'),'rls',(select jsonb_agg(jsonb_build_array(relname,relrowsecurity,relforcerowsecurity) order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='r'),'defaults',(select jsonb_agg(to_jsonb(d)) from pg_default_acl d),'acl',(select jsonb_agg(jsonb_build_array(relname,relacl::text) order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='r')) value;
-- Data API grants must not depend on Supabase's historical default privileges.
-- Additive and safe to replay. RLS policies, RPC ACLs and default ACLs are unchanged.
-- UUID defaults use gen_random_uuid(): no sequence grant is needed.

-- These policies already enforce ownership and reject admin-managed insert state.
-- Updates/deletes (including replies, resolutions and POS writes) remain RPC-only.
grant select, insert on public.customer_inquiries, public.return_requests
  to authenticated;
grant select on public.pos_devices to authenticated;

-- Edge Functions use serviceSelect for these resources. BYPASSRLS does not bypass
-- table ACL checks. Mutations run in the existing actor-checked SECURITY DEFINER
-- RPCs, so the service API needs SELECT only, not direct INSERT/UPDATE/DELETE.
grant select on public.customer_inquiries, public.return_requests, public.pos_devices,
  public.brands, public.banners, public.benefit_policies, public.reviews,
  public.admin_audit_logs, public.store_profile, public.policy_versions
  to service_role;

-- No anon/PUBLIC grants, blanket grants, default-privilege changes or RLS changes.
-- Existing installations may retain legacy wider ACLs; tightening those is a
-- separate rollout requiring a complete consumer audit, not part of this repair.

-- Data API grants must not depend on Supabase's historical default privileges.
-- Additive and safe to replay. RLS policies, RPC ACLs and default ACLs are unchanged.
-- UUID defaults use gen_random_uuid(): no sequence grant is needed.

-- These policies already enforce ownership and reject admin-managed insert state.
-- Updates/deletes (including replies, resolutions and POS writes) remain RPC-only.
grant select, insert on public.customer_inquiries, public.return_requests
  to authenticated;
grant select on public.pos_devices to authenticated;

-- Edge Functions use serviceSelect for these resources. BYPASSRLS does not bypass
-- table ACL checks. Mutations run in the existing actor-checked SECURITY DEFINER
-- RPCs, so the service API needs SELECT only, not direct INSERT/UPDATE/DELETE.
grant select on public.customer_inquiries, public.return_requests, public.pos_devices,
  public.brands, public.banners, public.benefit_policies, public.reviews,
  public.admin_audit_logs, public.store_profile, public.policy_versions
  to service_role;

-- No anon/PUBLIC grants, blanket grants, default-privilege changes or RLS changes.
-- Existing installations may retain legacy wider ACLs; tightening those is a
-- separate rollout requiring a complete consumer audit, not part of this repair.

select public._release_proof_assert(((select value->'rls' from boundary_before) = (select jsonb_agg(jsonb_build_array(relname,relrowsecurity,relforcerowsecurity) order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='r')),'RLS flags unchanged on grant replay');
select public._release_proof_assert(((select value->'policies' from boundary_before) = (select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public')),'RLS policies unchanged on grant replay');
select public._release_proof_assert(((select value->'acl' from boundary_before) = (select jsonb_agg(jsonb_build_array(relname,relacl::text) order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='r')),'ACL replay idempotent');
select public._release_proof_assert(((select bool_and(relrowsecurity) from pg_class where relnamespace='public'::regnamespace and relkind='r')),'all public tables have RLS');
select public._release_proof_assert((not exists(select 1 from unnest(array['customer_inquiries','return_requests','pos_devices']) t cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p where has_table_privilege('anon','public.'||t,p))),'anon has no target grants');
select public._release_proof_assert(((select bool_and(has_table_privilege('authenticated','public.'||t,p) = (p='SELECT' or (p='INSERT' and t<>'pos_devices'))) from unnest(array['customer_inquiries','return_requests','pos_devices']) t cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p)),'member minimum grants');
select public._release_proof_assert(((select bool_and(has_table_privilege('service_role','public.'||t,p) = (p='SELECT')) from unnest(array['customer_inquiries','return_requests','pos_devices','brands','banners','benefit_policies','reviews','admin_audit_logs','store_profile','policy_versions']) t cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p)),'service SELECT only');
select public._release_proof_assert((has_function_privilege('service_role','public.admin_ops_mutation_v1(uuid,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.admin_ops_mutation_v1(uuid,text,jsonb)','EXECUTE') and not has_function_privilege('authenticated','public.admin_ops_mutation_v1(uuid,text,jsonb)','EXECUTE')),'admin RPC service only');
insert into auth.users(id,email) values
('11111111-1111-4111-8111-111111111111','member@example.invalid'),
('22222222-2222-4222-8222-222222222222','other@example.invalid'),
('33333333-3333-4333-8333-333333333333','store@example.invalid'),
('44444444-4444-4444-8444-444444444444','cs@example.invalid'),
('55555555-5555-4555-8555-555555555555','payments@example.invalid');
insert into public.user_roles(user_id,role) values
('33333333-3333-4333-8333-333333333333','store_manager'),
('44444444-4444-4444-8444-444444444444','cs_manager'),
('55555555-5555-4555-8555-555555555555','payments_manager');
insert into public.orders(id,profile_id,order_no,subtotal_krw,total_krw) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','GRANTS-A',10000,10000),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','GRANTS-B',10000,10000);
insert into public.pos_devices(name) values('synthetic existing POS');

reset role; select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true); set local role authenticated;
insert into public.customer_inquiries(profile_id,subject,body) values('11111111-1111-4111-8111-111111111111','synthetic','synthetic');
select public._release_proof_assert(((select count(*)=1 from public.customer_inquiries where subject='synthetic')),'member creates own inquiry');
insert into public.return_requests(order_id,requested_by,request_type,reason) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','return','synthetic');
select public._release_proof_assert(((select count(*)=1 from public.return_requests where status='requested')),'member creates own return');
select public._release_proof_denied('insert into public.customer_inquiries(profile_id,subject,body) values(''22222222-2222-4222-8222-222222222222'',''bad'',''bad'')','other inquiry');
select public._release_proof_denied('insert into public.customer_inquiries(profile_id,subject,body,admin_reply) values(''11111111-1111-4111-8111-111111111111'',''bad'',''bad'',''spoof'')','spoof inquiry reply');
select public._release_proof_denied('insert into public.return_requests(order_id,requested_by,request_type,reason,status) values(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'',''11111111-1111-4111-8111-111111111111'',''return'',''bad'',''completed'')','spoof return status');
select public._release_proof_denied('insert into public.return_requests(order_id,requested_by,request_type,reason) values(''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'',''11111111-1111-4111-8111-111111111111'',''return'',''bad'')','other order return');
select public._release_proof_denied('insert into public.return_requests(order_id,requested_by,request_type,reason) values(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'',''22222222-2222-4222-8222-222222222222'',''return'',''bad'')','spoof return requester');
select public._release_proof_denied('update public.customer_inquiries set status=''closed''','direct update inquiry');
select public._release_proof_denied('delete from public.return_requests','direct delete return');
select public._release_proof_denied('select public.admin_ops_mutation_v1(''33333333-3333-4333-8333-333333333333'',''pos_create'',''{"name":"bad"}'')','spoof admin RPC');
select public._release_proof_assert(((select count(*)=0 from public.pos_devices)),'member cannot read POS');
reset role; select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true); set local role authenticated;
select public._release_proof_assert(((select count(*)=0 from public.customer_inquiries)),'other member cannot read customer_inquiries');
select public._release_proof_assert(((select count(*)=0 from public.return_requests)),'other member cannot read return_requests');
reset role; select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true); set local role authenticated;
select public._release_proof_assert(((select count(*)=1 from public.customer_inquiries)),'store visibility customer_inquiries');
select public._release_proof_assert(((select count(*)=1 from public.return_requests)),'store visibility return_requests');
select public._release_proof_assert(((select count(*)=1 from public.pos_devices)),'store visibility pos_devices');
select public._release_proof_denied('insert into public.pos_devices(name) values(''bad'')','store direct POS write');
reset role; select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true); set local role authenticated;
select public._release_proof_assert(((select count(*)=1 from public.customer_inquiries)),'cs visibility customer_inquiries');
select public._release_proof_assert(((select count(*)=1 from public.return_requests)),'cs visibility return_requests');
select public._release_proof_assert(((select count(*)=0 from public.pos_devices)),'cs visibility pos_devices');
select public._release_proof_denied('insert into public.pos_devices(name) values(''bad'')','cs direct POS write');
reset role; select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true); set local role authenticated;
select public._release_proof_assert(((select count(*)=0 from public.customer_inquiries)),'payments visibility customer_inquiries');
select public._release_proof_assert(((select count(*)=1 from public.return_requests)),'payments visibility return_requests');
select public._release_proof_assert(((select count(*)=0 from public.pos_devices)),'payments visibility pos_devices');
select public._release_proof_denied('insert into public.pos_devices(name) values(''bad'')','payments direct POS write');
reset role; select set_config('request.jwt.claim.sub','',true); set local role anon;
select public._release_proof_denied('select * from public.customer_inquiries','anon SELECT customer_inquiries');
select public._release_proof_denied('insert into public.customer_inquiries default values','anon INSERT customer_inquiries');
select public._release_proof_denied('select * from public.return_requests','anon SELECT return_requests');
select public._release_proof_denied('insert into public.return_requests default values','anon INSERT return_requests');
select public._release_proof_denied('select * from public.pos_devices','anon SELECT pos_devices');
select public._release_proof_denied('insert into public.pos_devices default values','anon INSERT pos_devices');
reset role; select set_config('request.jwt.claim.sub','',true); set local role service_role;
select public._release_proof_assert(((select count(*)>=0 from public.customer_inquiries)),'service SELECT customer_inquiries');
select public._release_proof_assert(((select count(*)>=0 from public.return_requests)),'service SELECT return_requests');
select public._release_proof_assert(((select count(*)>=0 from public.pos_devices)),'service SELECT pos_devices');
select public._release_proof_assert(((select count(*)>=0 from public.brands)),'service SELECT brands');
select public._release_proof_assert(((select count(*)>=0 from public.banners)),'service SELECT banners');
select public._release_proof_assert(((select count(*)>=0 from public.benefit_policies)),'service SELECT benefit_policies');
select public._release_proof_assert(((select count(*)>=0 from public.reviews)),'service SELECT reviews');
select public._release_proof_assert(((select count(*)>=0 from public.admin_audit_logs)),'service SELECT admin_audit_logs');
select public._release_proof_assert(((select count(*)>=0 from public.store_profile)),'service SELECT store_profile');
select public._release_proof_assert(((select count(*)>=0 from public.policy_versions)),'service SELECT policy_versions');
select public._release_proof_denied('update public.customer_inquiries set status=''closed''','service direct inquiry update');
select public._release_proof_denied('select public.admin_ops_mutation_v1(''11111111-1111-4111-8111-111111111111'',''pos_create'',''{"name":"bad"}'')','service customer cannot act as admin');
select public._release_proof_denied('select public.admin_ops_mutation_v1(''55555555-5555-4555-8555-555555555555'',''inquiry_create'',''{"subject":"bad","body":"bad"}'')','payments actor cannot reply to inquiry');
select public._release_proof_assert(((public.admin_ops_mutation_v1('33333333-3333-4333-8333-333333333333','pos_create','{"name":"synthetic rpc"}')->>'id') is not null),'store creates POS through RPC');
select public._release_proof_assert((public.admin_ops_mutation_v1('44444444-4444-4444-8444-444444444444','inquiry_reply',jsonb_build_object('id',(select id from public.customer_inquiries limit 1),'reply','synthetic reply'))->>'status'='replied'),'CS replies through RPC');
select public._release_proof_assert((public.admin_ops_mutation_v1('55555555-5555-4555-8555-555555555555','return_status',jsonb_build_object('id',(select id from public.return_requests limit 1),'status','approved'))->>'status'='approved'),'payments resolves return through RPC');
reset role;
select public._release_proof_assert(((select count(*)=3 from public.admin_audit_logs where action in ('pos_create','inquiry_reply','return_status_update'))),'three successful mutations audited');
select public._release_proof_assert(((select count(*)=56 from proof_results)),'all checks recorded');
rollback; select 57 as passed_checks, true as synthetic_transaction_rolled_back;
