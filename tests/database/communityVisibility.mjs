// Local PostgreSQL only. Never connects to live Supabase.
// COMMUNITY_TEST_DB_MODULE=file:///tmp/community-db-check/node_modules/@electric-sql/pglite/dist/index.js node tests/database/communityVisibility.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.COMMUNITY_TEST_DB_MODULE || '@electric-sql/pglite')
const migration = await readFile(new URL('../../supabase/migrations/community_visibility.sql', import.meta.url), 'utf8')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const admin = id(1), alice = id(2), bob = id(3), messageOnly = id(4)
const db = new PGlite()
const start = '2026-10-18T00:00:00+03:00', end = '2026-10-19T00:00:00+03:00'
const user = async (uid, role = 'authenticated') => {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid || ''])
  await db.exec(`SET ROLE ${role}`)
}
const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]
const view = async viewer => (await value('SELECT public.get_dashboard_community($1,$2,$3) AS result', [viewer, start, end])).result
const settings = async (uid, show, share) => (await value('SELECT public.set_dashboard_community_preferences($1,$2,$3) AS result', [uid, show, share])).result
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text, display_name text, email text, daily_message text);
    CREATE TABLE public.subjects(id uuid PRIMARY KEY, user_id uuid, name text);
    CREATE TABLE public.resources(id uuid PRIMARY KEY, user_id uuid, name text);
    CREATE TABLE public.study_sessions(id uuid PRIMARY KEY, user_id uuid, subject_id uuid, resource_id uuid, duration_minutes numeric, started_at timestamptz);
    GRANT SELECT ON public.profiles, public.study_sessions TO authenticated;
    INSERT INTO public.profiles VALUES
      ('${admin}', 'admin', 'Admin', 'admin@test', ''), ('${alice}', 'user', 'Alice', 'alice@test', ''),
      ('${bob}', 'user', 'Bob', 'bob@test', 'Bob mesaj'), ('${messageOnly}', 'user', 'Mesaj', 'mesaj@test', 'Sadece mesaj');
    INSERT INTO public.subjects VALUES ('${id(5)}', '${alice}', 'Sözel'), ('${id(6)}', '${bob}', 'Sayısal');
    INSERT INTO public.resources VALUES ('${id(7)}', '${alice}', 'Kaynak'), ('${id(8)}', '${alice}', 'Kaynak');
    INSERT INTO public.study_sessions VALUES
      ('${id(10)}', '${alice}', '${id(5)}', '${id(7)}', 15, '2026-10-18T10:00:00+03:00'),
      ('${id(11)}', '${alice}', '${id(5)}', '${id(8)}', 5, '2026-10-18T11:00:00+03:00'),
      ('${id(12)}', '${bob}', '${id(6)}', NULL, 40, '2026-10-18T09:00:00+03:00'),
      ('${id(13)}', '${alice}', '${id(5)}', NULL, 1000, '${end}'),
      ('${id(14)}', '${alice}', '${id(5)}', NULL, 1000, '2026-10-17T23:59:59+03:00');
  `)
  await db.exec(migration)
  await user(alice)
  const original = await view(alice)
  assert.equal(original.show_widget, true)
  assert.equal(original.share_statistics, true)
  assert.deepEqual(original.entries.map(row => row.user_id), [bob, alice, messageOnly])
  assert.equal(original.entries.find(row => row.user_id === alice).total, 20)
  assert.deepEqual(original.entries.find(row => row.user_id === alice).details, { 'Sözel — Kaynak': 20 })
  console.log('PASS defaults, stable ranking, Turkish day boundaries and grouped detail totals')

  await assert.rejects(settings(bob, false, false), /Admin access required/)
  await assert.rejects(view(bob), /Access denied/)
  await assert.rejects(db.query('INSERT INTO public.dashboard_community_preferences VALUES ($1,false,false)', [alice]), /permission denied/)
  await user(null, 'anon')
  await assert.rejects(view(alice), /permission denied/)
  await assert.rejects(settings(alice, false, false), /permission denied/)
  console.log('PASS non-admin, anonymous and forged viewer requests cannot change or bypass settings')

  await user(admin)
  assert.deepEqual(await settings(bob, false, true), { user_id: bob, show_widget: false, share_statistics: true })
  await user(bob)
  assert.deepEqual((await view(bob)).entries, [])
  assert.equal((await view(bob)).show_widget, false)
  await user(alice)
  assert.ok((await view(alice)).entries.some(row => row.user_id === bob))
  console.log('PASS hiding a widget does not hide that user from other dashboards')

  await user(admin)
  await settings(bob, true, false)
  await user(bob)
  const excluded = await view(bob)
  assert.equal(excluded.show_widget, true)
  assert.equal(excluded.share_statistics, false)
  assert.ok(excluded.entries.some(row => row.user_id === alice))
  assert.ok(!excluded.entries.some(row => row.user_id === bob))
  await user(alice)
  assert.ok(!JSON.stringify(await view(alice)).includes('Bob'))
  assert.equal((await value('SELECT count(*)::int AS n FROM public.study_sessions WHERE user_id=$1', [bob])).n, 1)
  assert.deepEqual((await db.query('SELECT user_id FROM public.dashboard_community_preferences')).rows, [])
  await assert.rejects(db.query('UPDATE public.dashboard_community_preferences SET share_statistics=true'), /permission denied/)
  console.log('PASS excluding statistics removes names/messages/details while preserving personal study records and RLS')

  await user(admin)
  await settings(messageOnly, true, false)
  assert.ok(!(await view(alice)).entries.some(row => row.user_id === messageOnly))
  await settings(bob, false, false)
  assert.deepEqual((await view(bob)).entries, []) // verified admin impersonation
  await assert.rejects(settings(id(99), true, true), /Profile not found/)
  await assert.rejects(settings(alice, null, true), /Invalid community preferences/)
  await assert.rejects(db.query('SELECT public.get_dashboard_community($1,$2,$3)', [alice, end, start]), /Invalid day range/)
  await assert.rejects(db.query("SELECT public.get_dashboard_community($1,$2,'infinity')", [alice, start]), /Invalid day range/)
  await db.exec('RESET ROLE')
  await db.exec(migration)
  await user(admin)
  assert.equal((await view(bob)).show_widget, false)
  await settings(bob, true, true)
  assert.ok((await view(alice)).entries.some(row => row.user_id === bob && row.total === 40))
  assert.equal((await value('SELECT count(*)::int AS n FROM public.study_sessions')).n, 5)
  console.log('PASS independent toggles, admin impersonation, invalid inputs, idempotent migration and restoring visibility')
} finally { await db.close() }
