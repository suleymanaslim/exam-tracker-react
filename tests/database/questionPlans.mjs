// Local PostgreSQL checks; does not connect to Supabase.
// npm install --prefix /tmp/question-db --no-save @electric-sql/pglite
// QUESTION_TEST_DB_MODULE=file:///tmp/question-db/node_modules/@electric-sql/pglite/dist/index.js node tests/database/questionPlans.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.QUESTION_TEST_DB_MODULE || '@electric-sql/pglite')
const migration = await readFile(new URL('../../supabase/migrations/question_plans.sql', import.meta.url), 'utf8')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const alice = id(1), bob = id(2), admin = id(3), subject = id(4), foreignSubject = id(5), resource = id(6), foreignResource = id(7), video = id(8), foreignVideo = id(9)
const bootstrap = `
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text NOT NULL);
CREATE TABLE public.subjects(id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.resources(id uuid PRIMARY KEY, user_id uuid NOT NULL, subject_id uuid REFERENCES public.subjects);
CREATE TABLE public.video_plan_items(id uuid PRIMARY KEY, user_id uuid NOT NULL, resource_id uuid REFERENCES public.resources, is_completed boolean DEFAULT false);
CREATE TABLE public.study_sessions(id uuid PRIMARY KEY, user_id uuid NOT NULL, subject_id uuid, resource_id uuid, session_type text, started_at timestamptz, ended_at timestamptz, duration_minutes numeric(12,6));
GRANT SELECT ON public.profiles, public.subjects, public.resources, public.video_plan_items, public.study_sessions TO authenticated;
INSERT INTO auth.users VALUES ('${alice}'), ('${bob}'), ('${admin}');
INSERT INTO public.profiles VALUES ('${alice}', 'user'), ('${bob}', 'user'), ('${admin}', 'admin');
INSERT INTO public.subjects VALUES ('${subject}', '${alice}'), ('${foreignSubject}', '${bob}');
INSERT INTO public.resources VALUES ('${resource}', '${alice}', '${subject}'), ('${foreignResource}', '${bob}', '${foreignSubject}');
INSERT INTO public.video_plan_items(id, user_id, resource_id) VALUES ('${video}', '${alice}', '${resource}'), ('${foreignVideo}', '${bob}', '${foreignResource}');
`
async function scenario(oldMigration = null) {
  const db = new PGlite()
  const user = async uid => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid || '']); await db.exec('SET ROLE authenticated') }
  const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]
  const target = async (uid, sid, date, count, period = 'day', vid = null, planId = null) => (await value('SELECT public.set_question_target($1,$2,$3,$4,$5,$6,$7) AS id', [uid, sid, date, count, period, vid, planId])).id
  const add = async (entryId, planId, count) => db.query('SELECT public.add_solved_questions($1,$2,$3)', [entryId, planId, count])
  try {
    await db.exec(bootstrap)
    if (oldMigration) {
      await db.exec(oldMigration)
      await user(alice)
      const oldPlan = (await value("INSERT INTO public.question_plans(user_id,video_plan_item_id,subject_id,resource_id,date,target_questions) VALUES ($1,$2,$3,$4,'2026-10-09',30) RETURNING id", [alice, video, subject, resource])).id
      await add(id(10), oldPlan, 15)
      await db.query("SELECT public.save_question_study_session($1,NULL,$2,$3,'2026-10-09',5,'2026-10-09T10:00Z','2026-10-09T10:01:07Z',67.0/60)", [id(11), alice, subject])
      await db.exec('RESET ROLE')
      await db.exec(migration)
      assert.equal((await value('SELECT count(*)::int AS n FROM public.question_session_results')).n, 2)
      assert.equal((await value('SELECT count(*)::int AS n FROM public.study_sessions')).n, 1)
      assert.equal((await value('SELECT sum(solved_questions)::int AS n FROM public.question_session_results')).n, 20)
      console.log('PASS upgrade preserves existing goals, results and exact study duration')
    } else await db.exec(migration)
    await user(alice)
    // Watching a video is intentionally unnecessary.
    const videoPlan = await target(alice, subject, '2026-10-09', 30, 'day', video)
    const week = await target(alice, subject, '2026-10-09', 100, 'week')
    assert.equal((await value('SELECT date::text AS date FROM public.question_plans WHERE id=$1', [week])).date, '2026-10-05')
    const day = await target(alice, subject, '2026-10-05', 20)
    assert.notEqual(day, week)
    assert.equal(await target(alice, subject, '2026-10-10', 120, 'week'), week)
    await add(id(20), videoPlan, 20)
    await add(id(20), videoPlan, 20)
    assert.equal((await value('SELECT count(*)::int AS n FROM public.question_session_results WHERE id=$1', [id(20)])).n, 1)
    const sessionsBefore = (await value('SELECT count(*)::int AS n FROM public.study_sessions')).n
    await db.query('SELECT public.update_question_result($1,15,10,5)', [id(20)])
    assert.equal((await value('SELECT solved_questions FROM public.question_session_results WHERE id=$1', [id(20)])).solved_questions, 15)
    await assert.rejects(db.query('SELECT public.update_question_result($1,15,10,10)', [id(20)]), /Invalid question count/)
    await db.query('SELECT public.archive_question_plan($1)', [videoPlan])
    assert.ok((await value('SELECT archived_at FROM public.question_plans WHERE id=$1', [videoPlan])).archived_at)
    assert.equal((await value('SELECT count(*)::int AS n FROM public.question_session_results WHERE id=$1', [id(20)])).n, 1)
    await db.query('SELECT public.remove_question_result($1)', [id(20)])
    await db.query('SELECT public.remove_question_result($1)', [id(20)])
    assert.ok((await value('SELECT deleted_at FROM public.question_session_results WHERE id=$1', [id(20)])).deleted_at)
    assert.equal((await value('SELECT count(*)::int AS n FROM public.study_sessions')).n, sessionsBefore)
    console.log('PASS unviewed-video goals, weekly dates, retries, corrections and removals')
    await db.query("SELECT public.save_question_study_session($1,NULL,$2,$3,'2026-10-09',10,'2026-10-09T10:00Z','2026-10-09T10:01:07Z',67.0/60)", [id(21), alice, subject])
    await db.query("SELECT public.save_question_study_session($1,NULL,$2,$3,'2026-10-09',10,'2026-10-09T10:00Z','2026-10-09T10:01:07Z',67.0/60)", [id(21), alice, subject])
    assert.equal((await value('SELECT count(*)::int AS n FROM public.study_sessions WHERE id=$1', [id(21)])).n, 1)
    const timed = await value('SELECT id FROM public.question_session_results WHERE session_id=$1', [id(21)])
    await db.query('SELECT public.update_question_result($1,5,NULL,NULL)', [timed.id])
    await db.query('SELECT public.remove_question_result($1)', [timed.id])
    assert.equal(Number((await value('SELECT duration_minutes FROM public.study_sessions WHERE id=$1', [id(21)])).duration_minutes), 1.116667)
    console.log('PASS extra stopwatch sessions use the new conflict key and retain time after count edits')
    await assert.rejects(target(bob, foreignSubject, '2026-10-09', 20), /Access denied/)
    await assert.rejects(target(alice, foreignSubject, '2026-10-09', 20), /Subject not found/)
    await assert.rejects(target(alice, subject, '2026-10-09', 20, 'day', foreignVideo), /Video not found/)
    await assert.rejects(db.query('UPDATE public.question_plans SET target_questions=999 WHERE id=$1', [week]), /permission denied/)
    await assert.rejects(db.query('UPDATE public.profiles SET role=\'admin\' WHERE id=$1', [alice]), /permission denied/)
    await user(bob)
    assert.deepEqual((await db.query('SELECT id FROM public.question_plans')).rows, [])
    for (const sql of ['SELECT public.archive_question_plan($1)', 'SELECT public.update_question_result($1,5)', 'SELECT public.remove_question_result($1)']) {
      await assert.rejects(db.query(sql, [sql.includes('archive') ? week : timed.id]), /Access denied/)
    }
    await user(null)
    await assert.rejects(target(alice, subject, '2026-10-09', 30), /Access denied/)
    await user(admin)
    assert.equal(await target(alice, subject, '2026-10-09', 150, 'week'), week)
    const bobPlan = await target(bob, foreignSubject, '2026-10-09', 30, 'day', foreignVideo)
    await add(id(22), bobPlan, 15)
    await db.query('SELECT public.update_question_result($1,12)', [id(22)])
    await db.query('SELECT public.remove_question_result($1)', [id(22)])
    await db.query('SELECT public.archive_question_plan($1)', [bobPlan])
    console.log('PASS owner/admin authorization, foreign-row denial and immutable identities')
    await db.exec('RESET ROLE')
    const counts = await value('SELECT (SELECT count(*) FROM public.question_plans)::int AS plans, (SELECT count(*) FROM public.question_session_results)::int AS results, (SELECT count(*) FROM public.study_sessions)::int AS sessions')
    await db.exec(migration)
    assert.deepEqual(await value('SELECT (SELECT count(*) FROM public.question_plans)::int AS plans, (SELECT count(*) FROM public.question_session_results)::int AS results, (SELECT count(*) FROM public.study_sessions)::int AS sessions'), counts)
    assert.ok((await value('SELECT deleted_at FROM public.question_session_results WHERE id=$1', [id(20)])).deleted_at)
    assert.ok((await value('SELECT archived_at FROM public.question_plans WHERE id=$1', [videoPlan])).archived_at)
    console.log('PASS rerunning migration keeps data, archives and removed results intact')
  } finally { await db.close() }
}
try {
  await scenario()
  if (process.env.OLD_QUESTION_MIGRATION) await scenario(await readFile(process.env.OLD_QUESTION_MIGRATION, 'utf8'))
} catch (error) {
  console.error('SQL CHECK FAILED:', error.message, error.code || '', error.where || '')
  process.exitCode = 1
}
