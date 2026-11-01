import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';

// Deliberately cannot target a hosted project or a normal application database.
const target = process.env.REBALL_GRANTS_TEST_URL;
if (!target) throw new Error('Set REBALL_GRANTS_TEST_URL to a NEW local reball_grants_* database');
const url = new URL(target);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Loopback PostgreSQL only');
assert(/^\/reball_grants_[a-z0-9_]+$/.test(url.pathname), 'Isolated database name required');
const client = new pg.Client({ connectionString: target });
await client.connect();
let checks = 0;
async function check(label, sql, expected) {
  const { rows } = await client.query(sql);
  assert.deepEqual(rows[0]?.value, expected, label);
  checks++;
  console.log(`PASS ${label}`);
}
async function denied(label, sql) {
  await client.query('savepoint denied_case');
  let code;
  try { await client.query(sql); } catch (error) { code = error.code; }
  await client.query('rollback to savepoint denied_case');
  assert.equal(code, '42501', label);
  checks++;
  console.log(`PASS ${label} (42501)`);
}
async function actor(role, uid = '') {
  await client.query('reset role');
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  assert(['anon', 'authenticated', 'service_role'].includes(role));
  await client.query(`set role ${role}`);
}
try {
  const { rows: existing } = await client.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','private') and c.relkind in ('r','v','S')");
  assert.equal(existing[0].n, 0, 'Refusing to replay migrations into a populated database');
  await client.query(await readFile('tests/db/data-api-grants/bootstrap.sql', 'utf8'));
  const names = (await readdir('supabase/migrations')).filter(n => n.endsWith('.sql')).sort();
  const patches = names.filter(n => n.endsWith('_explicit_data_api_grants.sql'));
  assert.equal(patches.length, 1);
  const patchName = patches[0];
  const patch = await readFile(`supabase/migrations/${patchName}`, 'utf8');
  for (const name of names.filter(n => n !== patchName)) {
    const original = await readFile(`supabase/migrations/${name}`, 'utf8');
    // Only two infrastructure extension-install statements are substituted.
    // Their SQL bodies/schedules still replay, against inert cron/Vault doubles.
    const sql = original.replace(/^create extension if not exists (pg_cron|pg_net)( with schema extensions)?;$/gm, '-- local infrastructure test double installed by bootstrap');
    await client.query(sql);
    console.log(`MIGRATION ${name} sha256=${createHash('sha256').update(original).digest('hex')}`);
  }
  console.log(`REPLAY ${names.length - 1} baseline migrations; cron/pg_net installs substituted, no scheduled jobs executed`);
  const snapshotSQL = `select jsonb_build_object(
    'policies',(select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public'),
    'rls',(select jsonb_agg(jsonb_build_array(relname,relrowsecurity,relforcerowsecurity) order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='r'),
    'functions',(select jsonb_agg(jsonb_build_array(oid::regprocedure::text,proacl::text,pg_get_functiondef(oid)) order by oid::regprocedure::text) from pg_proc where pronamespace in ('public'::regnamespace,'private'::regnamespace)),
    'defaults',(select jsonb_agg(to_jsonb(d)) from pg_default_acl d)) value`;
  const before = (await client.query(snapshotSQL)).rows[0].value;
  // First establish the precise failure on an otherwise complete migration replay.
  await check('baseline inquiry INSERT grant absent', "select has_table_privilege('authenticated','public.customer_inquiries','INSERT') value", false);
  await check('baseline return SELECT grant absent', "select has_table_privilege('authenticated','public.return_requests','SELECT') value", false);
  await check('baseline service POS SELECT grant absent', "select has_table_privilege('service_role','public.pos_devices','SELECT') value", false);
  await client.query('begin');
  await actor('authenticated', '11111111-1111-4111-8111-111111111111');
  await denied('baseline real inquiry SELECT denied', 'select * from public.customer_inquiries');
  await client.query('reset role; rollback');
  await client.query(patch);
  const firstACL = (await client.query("select relname,relacl::text from pg_class where relnamespace='public'::regnamespace order by relname")).rows;
  await client.query(patch);
  assert.deepEqual((await client.query("select relname,relacl::text from pg_class where relnamespace='public'::regnamespace order by relname")).rows, firstACL, 'Patch replay must be idempotent');
  checks++;
  assert.deepEqual((await client.query(snapshotSQL)).rows[0].value, before, 'RLS, functions/RPC ACLs and default ACLs unchanged');
  checks++;
  await check('all public tables retain RLS', "select bool_and(relrowsecurity) value from pg_class where relnamespace='public'::regnamespace and relkind='r'", true);
  await check('no anon target privileges', "select not exists(select 1 from unnest(array['customer_inquiries','return_requests','pos_devices']) t cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p where has_table_privilege('anon','public.'||t,p)) value", true);
  await check('member target privilege matrix is minimal', `select bool_and(has_table_privilege('authenticated','public.'||t,p) = (p='SELECT' or (p='INSERT' and t<>'pos_devices'))) value from unnest(array['customer_inquiries','return_requests','pos_devices']) t cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p`, true);
  await check('service target privilege matrix is SELECT only', `select bool_and(has_table_privilege('service_role','public.'||t,p) = (p='SELECT')) value from unnest(array['customer_inquiries','return_requests','pos_devices','brands','banners','benefit_policies','reviews','admin_audit_logs','store_profile','policy_versions']) t cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p`, true);
  await check('admin mutation RPC service only', `select has_function_privilege('service_role','public.admin_ops_mutation_v1(uuid,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.admin_ops_mutation_v1(uuid,text,jsonb)','EXECUTE') and not has_function_privilege('authenticated','public.admin_ops_mutation_v1(uuid,text,jsonb)','EXECUTE') value`, true);
  await client.query('begin');
  await client.query(await readFile('tests/db/data-api-grants/fixtures.sql', 'utf8'));
  const member = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const store = '33333333-3333-4333-8333-333333333333';
  const cs = '44444444-4444-4444-8444-444444444444';
  const payments = '55555555-5555-4555-8555-555555555555';
  await actor('authenticated',member);
  await check('member can create and return own inquiry', `insert into public.customer_inquiries(profile_id,subject,body) values('${member}','synthetic','synthetic') returning subject='synthetic' value`, true);
  await check('member can create own return', `insert into public.return_requests(order_id,requested_by,request_type,reason) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${member}','return','synthetic') returning status='requested' value`, true);
  await denied('cannot insert another member inquiry', `insert into public.customer_inquiries(profile_id,subject,body) values('${other}','bad','bad')`);
  await denied('cannot spoof inquiry reply', `insert into public.customer_inquiries(profile_id,subject,body,admin_reply) values('${member}','bad','bad','spoof')`);
  await denied('cannot spoof resolved return', `insert into public.return_requests(order_id,requested_by,request_type,reason,status) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${member}','return','bad','completed')`);
  await denied('cannot return another member order', `insert into public.return_requests(order_id,requested_by,request_type,reason) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${member}','return','bad')`);
  await denied('cannot spoof return requester', `insert into public.return_requests(order_id,requested_by,request_type,reason) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${other}','return','bad')`);
  await check('member cannot read POS', 'select count(*)::int=0 value from public.pos_devices', true);
  await denied('member cannot update inquiry', "update public.customer_inquiries set status='closed'");
  await denied('member cannot delete return', 'delete from public.return_requests');
  await denied('member cannot invoke actor-spoofed admin RPC', `select public.admin_ops_mutation_v1('${store}','pos_create','{"name":"bad"}')`);
  await actor('authenticated',other);
  await check('other member cannot read inquiry', 'select count(*)::int=0 value from public.customer_inquiries', true);
  await check('other member cannot read return', 'select count(*)::int=0 value from public.return_requests', true);
  for (const [id, label, inquiries, returns, pos] of [[store,'store',1,1,1],[cs,'cs',1,1,0],[payments,'payments',0,1,0]]) {
    await actor('authenticated',id);
    for (const [table,n] of [['customer_inquiries',inquiries],['return_requests',returns],['pos_devices',pos]]) {
      await check(`${label} RLS ${table}`, `select count(*)::int value from public.${table}`,n);
    }
    await denied(`${label} cannot directly write POS`, "insert into public.pos_devices(name) values('bad')");
  }
  await actor('anon');
  for (const table of ['customer_inquiries','return_requests','pos_devices']) {
    await denied(`anon SELECT ${table}`,`select * from public.${table}`);
    await denied(`anon INSERT ${table}`, `insert into public.${table} default values`);
  }
  await actor('service_role');
  for (const table of ['customer_inquiries','return_requests','pos_devices','brands','banners','benefit_policies','reviews','admin_audit_logs','store_profile','policy_versions']) {
    await client.query(`select * from public.${table} limit 1`); checks++;
  }
  await denied('service cannot directly update inquiry', "update public.customer_inquiries set status='closed'");
  await denied('service cannot use customer actor as admin', `select public.admin_ops_mutation_v1('${member}','pos_create','{"name":"bad"}')`);
  await denied('service cannot use payments actor for CS reply', `select public.admin_ops_mutation_v1('${payments}','inquiry_create','{"subject":"bad","body":"bad"}')`);
  await check('service store actor can create POS through RPC', `select (public.admin_ops_mutation_v1('${store}','pos_create','{"name":"synthetic rpc"}')->>'id') is not null value`, true);
  const inquiry = (await client.query('select id from public.customer_inquiries limit 1')).rows[0].id;
  const returnId = (await client.query('select id from public.return_requests limit 1')).rows[0].id;
  await check('service CS actor can reply through RPC', `select public.admin_ops_mutation_v1('${cs}','inquiry_reply','{"id":"${inquiry}","reply":"synthetic reply"}')->>'status' = 'replied' value`, true);
  await check('service payments actor can resolve return through RPC', `select public.admin_ops_mutation_v1('${payments}','return_status','{"id":"${returnId}","status":"approved"}')->>'status' = 'approved' value`, true);
  await client.query('reset role');
  await check('three successful mutations produced audit entries', "select count(*)::int value from public.admin_audit_logs where action in ('pos_create','inquiry_reply','return_status_update')", 3);
  await client.query('rollback');
  // Legacy installations retain their pre-existing grants. This is deliberately
  // not a revoke/hardening migration and must not silently change that contract.
  await client.query('begin');
  await client.query(`grant all on public.customer_inquiries,public.return_requests,public.pos_devices to anon,authenticated,service_role`);
  const legacySQL = "select relname,relacl::text from pg_class where relnamespace='public'::regnamespace order by relname";
  const legacyBefore = (await client.query(legacySQL)).rows;
  await client.query(patch);
  await client.query(patch);
  assert.deepEqual((await client.query(legacySQL)).rows,legacyBefore,'Existing legacy ACLs are preserved');
  assert.deepEqual((await client.query(snapshotSQL)).rows[0].value,before,'Legacy RLS/RPC/default boundaries preserved');
  checks += 2;
  await client.query('rollback');
  const audit = await client.query(`select c.relname, c.relrowsecurity,
    (select string_agg(p.privilege_type,',' order by p.privilege_type) from information_schema.role_table_grants p where p.table_schema='public' and p.table_name=c.relname and p.grantee='anon') anon,
    (select string_agg(p.privilege_type,',' order by p.privilege_type) from information_schema.role_table_grants p where p.table_schema='public' and p.table_name=c.relname and p.grantee='authenticated') authenticated,
    (select string_agg(p.privilege_type,',' order by p.privilege_type) from information_schema.role_table_grants p where p.table_schema='public' and p.table_name=c.relname and p.grantee='service_role') service_role
    from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by c.relname`);
  console.log('FINAL_TABLE_ACL ' + JSON.stringify(audit.rows));
  console.log(`PASS ${checks} checks; restrictive fresh DB and legacy ACL replay; synthetic data rolled back`);
} finally {
  await client.query('reset role; rollback').catch(() => {});
  await client.end();
}
