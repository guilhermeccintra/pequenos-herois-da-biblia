import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sql = await readFile(new URL('../supabase/migrations/202610300001_initial.sql', import.meta.url), 'utf8').catch(() => '');
const expansionSql = await readFile(new URL('../supabase/migrations/202610300002_expand_365.sql', import.meta.url), 'utf8');
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';

// Supabase infrastructure stubs only: roles, auth.uid and Storage catalog.
// The application migration, tables, policies and functions run unchanged on Postgres.
async function database() {
  assert.ok(sql.length > 0, 'application database migration is missing');
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated, service_role;
    grant all on storage.objects to anon, authenticated, service_role;
    create policy existing_broad_storage_policy on storage.objects for all to anon, authenticated using (true) with check (true);
    insert into auth.users values ('${alice}'), ('${bob}');
  `);
  await db.exec(sql);
  await db.exec(sql); // deployment scripts may be run twice, without dropping data.
  await db.exec(`set role service_role; select public.import_story(1, '{"id":1,"parts":[],"audio_path":null}'); reset role;`);
  return db;
}

test('RLS isolates parent progress; browser roles cannot read paid narrative or alter subscription grants', async () => {
  const db = await database();
  try {
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}'; insert into public.reading_progress(user_id,story_id,part) values('${alice}',1,2);`);
    await assert.rejects(db.exec(`insert into public.reading_progress(user_id,story_id) values('${bob}',1);`), /row-level security/);
    await assert.rejects(db.exec(`update public.reading_progress set part=4 where user_id='${alice}'`), /check constraint/);
    await assert.rejects(db.exec('select body from public.stories'), /permission denied/);
    await assert.rejects(db.exec(`insert into public.subscriptions(user_id,status) values('${alice}','active')`), /permission denied/);
    await assert.rejects(db.exec(`select public.acquire_billing_lock('${alice}')`), /permission denied/);
    await db.exec(`set request.jwt.claim.sub = '${bob}'`);
    assert.equal((await db.query('select * from public.reading_progress')).rows.length, 0);
    await db.exec(`update public.reading_progress set favorite=true where user_id='${alice}'`);
    await db.exec(`set request.jwt.claim.sub = '${alice}'`);
    assert.equal((await db.query('select favorite from public.reading_progress')).rows[0].favorite, false);
  } finally { await db.close(); }
});

test('private Storage guard survives an unrelated broad policy and allows service-role operations', async () => {
  const db = await database();
  try {
    await db.exec(`set role service_role; insert into storage.objects(bucket_id,name) values('story-assets','01/part1.webp'),('other','public.webp'); set role anon;`);
    assert.deepEqual((await db.query('select name from storage.objects')).rows, [{ name: 'public.webp' }]);
    await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values('story-assets','attack.webp')`), /row-level security/);
    await db.exec('reset role');
    assert.equal((await db.query("select public from storage.buckets where id='story-assets'")).rows[0].public, false);
  } finally { await db.close(); }
});

test('billing lease excludes concurrent workers and commits snapshot plus webhook id atomically', async () => {
  const db = await database();
  try {
    await db.exec('set role service_role');
    const token = (await db.query('select public.acquire_billing_lock($1) as token', [alice])).rows[0].token;
    assert.ok(token);
    assert.equal((await db.query('select public.acquire_billing_lock($1) as token', [alice])).rows[0].token, null);
    const snapshot = { stripe_subscription_id: 'sub_one', status: 'active', plan: 'annual', current_period_end: '2027-01-01T00:00:00Z', cancel_at_period_end: false };
    await db.query('select public.save_stripe_customer($1,$2,$3)', [alice, token, 'cus_one']);
    await db.query('select public.commit_billing_snapshot($1,$2,$3,$4,$5,$6)', [alice, token, snapshot, 'evt_one', 'invoice.paid', 10]);
    await db.query('select public.commit_billing_snapshot($1,$2,$3,$4,$5,$6)', [alice, token, { ...snapshot, status: 'canceled' }, 'evt_one', 'invoice.paid', 10]);
    assert.equal((await db.query('select status from public.subscriptions')).rows[0].status, 'active');
    assert.equal((await db.query('select count(*)::int as count from public.stripe_events')).rows[0].count, 1);
    await assert.rejects(db.query('select public.commit_billing_snapshot($1,$2,$3,$4,$5,$6)', [alice, token, { ...snapshot, plan: 'invalid' }, 'evt_bad', 'invoice.paid', 11]), /check constraint/);
    assert.equal((await db.query("select count(*)::int as count from public.stripe_events where id='evt_bad'")).rows[0].count, 0);
    await db.exec(`update public.subscriptions set billing_lock_until=now()-interval '1 second'`);
    await assert.rejects(db.query('select public.commit_billing_snapshot($1,$2,$3,$4,$5,$6)', [alice, token, snapshot, 'evt_stale', 'invoice.paid', 11]), /expired billing lease/);
    assert.equal((await db.query("select count(*)::int as count from public.stripe_events where id='evt_stale'")).rows[0].count, 0);
  } finally { await db.close(); }
});

test('checkout reservation survives retries, then rotates after a completed request; content reimport preserves audio', async () => {
  const db = await database();
  try {
    await db.exec('set role service_role');
    const token = (await db.query('select public.acquire_billing_lock($1) as token', [alice])).rows[0].token;
    const reserve = async () => (await db.query('select public.reserve_checkout_request($1,$2,$3) as id', [alice, token, 'monthly'])).rows[0].id;
    const first = await reserve(); assert.equal(await reserve(), first);
    await assert.rejects(db.query('select public.reserve_checkout_request($1,$2,$3)', [alice, token, 'annual']), /unresolved checkout request/);
    assert.equal((await db.query('select checkout_request_id from public.subscriptions')).rows[0].checkout_request_id, first);
    await db.exec("update public.subscriptions set checkout_requested_at=now()-interval '24 hours'");
    await assert.rejects(reserve(), /unresolved checkout request/);
    assert.equal((await db.query('select checkout_request_id from public.subscriptions')).rows[0].checkout_request_id, first);
    await db.query('select public.save_checkout_session($1,$2,$3,$4)', [alice, token, first, 'cs_one']);
    assert.notEqual(await reserve(), first);
    await db.exec(`update public.stories set body=jsonb_set(body,'{audio_path}','"audio/01/hash.mp3"') where id=1`);
    await db.query('select public.import_story($1,$2)', [1, { id: 1, title: 'Texto corrigido', parts: [], audio_path: null }]);
    const body = (await db.query('select body from public.stories where id=1')).rows[0].body;
    assert.equal(body.title, 'Texto corrigido');
    assert.equal(body.audio_path, 'audio/01/hash.mp3');
  } finally { await db.close(); }
});

test('expansão aceita o dia 365, preserva conteúdo e progresso e pode ser reaplicada', async () => {
 const db=await database();
 try{
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${alice}'; insert into public.reading_progress(user_id,story_id,part,favorite) values('${alice}',1,2,true); reset role;`);
  await assert.rejects(db.query('select public.import_story($1,$2)',[365,{id:365,parts:[],audio_path:null}]),/check constraint/);
  await db.exec(expansionSql);await db.exec(expansionSql);
  await db.exec('set role service_role');
  for(const id of [41,100,365])await db.query('select public.import_story($1,$2)',[id,{id,parts:[],audio_path:null}]);
  await assert.rejects(db.query('select public.import_story($1,$2)',[366,{id:366,parts:[]}]),/check constraint/);
  assert.deepEqual((await db.query('select part,favorite from public.reading_progress')).rows,[{part:2,favorite:true}]);
  assert.equal((await db.query('select count(*)::int as count from public.stories')).rows[0].count,4);
  await db.exec('set role anon');
  await assert.rejects(db.exec('select body from public.stories where id=365'),/permission denied/);
 }finally{await db.close();}
});
