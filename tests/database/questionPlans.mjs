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
      // Version 1 granted inserts; later versions use the target RPC.
      const legacyInsert = (await value("SELECT has_table_privilege('authenticated','public.question_plans','INSERT') AS allowed")).allowed
      const oldPlan = legacyInsert
        ? (await value("INSERT INTO public.question_plans(user_id,video_plan_item_id,subject_id,resource_id,date,target_questions) VALUES ($1,$2,$3,$4,'2026-10-09',30) RETURNING id", [alice, video, subject, resource])).id
        : await target(alice, subject, '2026-10-09', 30, 'day', video)
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
    await db.query('SELECT public.add_solved_questions($1,$2,20,15,5,$3)', [id(30), week, '  Sözcükte anlam  '])
    await db.query('SELECT public.add_solved_questions($1,$2,20,15,5,$3)', [id(30), week, 'Sözcükte anlam'])
    assert.equal((await value('SELECT note FROM public.question_session_results WHERE id=$1', [id(30)])).note, 'Sözcükte anlam')
    await assert.rejects(db.query('SELECT public.add_solved_questions($1,$2,20,15,5,$3)', [id(30), week, 'Other topic']), /different data/)
    await db.query('SELECT public.update_question_result($1,25,20,5,$2)', [id(30), 'Paragraf'])
    assert.equal((await value('SELECT note FROM public.question_session_results WHERE id=$1', [id(30)])).note, 'Paragraf')
    await assert.rejects(db.query('SELECT public.update_question_result($1,25,20,5,$2)', [id(30), 'x'.repeat(1001)]), /Invalid question count/)
    await db.query("SELECT public.save_question_study_session($1,NULL,$2,$3,'2026-10-09',20,'2026-10-09T10:00Z','2026-10-09T10:01:07Z',67.0/60,15,5,$4)", [id(31), alice, subject, 'Deyimler'])
    await db.query("SELECT public.save_question_study_session($1,NULL,$2,$3,'2026-10-09',20,'2026-10-09T10:00Z','2026-10-09T10:01:07Z',67.0/60,15,5,$4)", [id(31), alice, subject, 'Deyimler'])
    assert.equal((await value('SELECT note FROM public.question_session_results WHERE session_id=$1', [id(31)])).note, 'Deyimler')
    const signatures = await value("SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('save_question_study_session','add_solved_questions','update_question_result') AND pronamespace='public'::regnamespace")
    assert.equal(signatures.n, 3)
    console.log('PASS notes persist through manual/timed saves, edits and retries without ambiguous RPC overloads')
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
    assert.equal((await value('SELECT note FROM public.question_session_results WHERE id=$1', [id(30)])).note, 'Paragraf')
    console.log('PASS rerunning migration keeps data, notes, archives and removed results intact')
    await user(alice)
    const notedTarget = async (note, period='day', planId=null) => (await value('SELECT public.set_question_target_with_note($1,$2,$3,$4,$5,$6,NULL,$7) AS id', [alice,subject,'2026-10-10',30,note,period,planId])).id
    const topicA = await notedTarget('  Sözcükte anlam  ')
    const topicB = await notedTarget('Cümlede anlam')
    assert.notEqual(topicA,topicB)
    assert.equal(await notedTarget('Sözcükte anlam'),topicA)
    await db.query('SELECT public.add_solved_questions($1,$2,12,NULL,NULL,NULL)',[id(1001),topicA])
    assert.equal((await value('SELECT note FROM public.question_session_results WHERE id=$1',[id(1001)])).note,'Sözcükte anlam')
    await assert.rejects(db.query('SELECT public.add_solved_questions($1,$2,12,NULL,NULL,$3)',[id(1002),topicA,'Başka konu']),/QUESTION_PLAN_NOTE_MISMATCH/)
    await assert.rejects(notedTarget('Başka konu','day',topicA),/QUESTION_PLAN_NOTE_LOCKED/)
    await assert.rejects(notedTarget(null,'day',topicA),/QUESTION_PLAN_NOTE_LOCKED/)
    await assert.rejects(db.query('SELECT public.update_question_result($1,11,NULL,NULL,$2)',[id(1001),'Başka konu']),/QUESTION_PLAN_NOTE_MISMATCH/)
    await db.query('SELECT public.update_question_result($1,11)',[id(1001)])
    assert.equal((await value('SELECT note FROM public.question_session_results WHERE id=$1',[id(1001)])).note,'Sözcükte anlam')
    const timedTopic = [id(1003),topicB,alice,subject,'2026-10-10',7,'2026-10-10T10:00Z','2026-10-10T10:02Z',2]
    await db.query('SELECT public.save_question_study_session($1,$2,$3,$4,$5,$6,$7,$8,$9)',timedTopic)
    await db.query('SELECT public.save_question_study_session($1,$2,$3,$4,$5,$6,$7,$8,$9)',timedTopic)
    assert.equal((await value('SELECT note FROM public.question_session_results WHERE session_id=$1',[id(1003)])).note,'Cümlede anlam')
    await db.query("SELECT public.save_question_study_session($1,NULL,$2,$3,'2026-10-10',5,'2026-10-10T10:00Z','2026-10-10T10:02Z',2)",[id(1004),alice,subject])
    assert.notEqual((await value('SELECT question_plan_id FROM public.question_session_results WHERE session_id=$1',[id(1004)])).question_plan_id,topicA)
    assert.equal((await value('SELECT count(*)::int AS n FROM public.question_session_results WHERE question_plan_id=$1',[topicB])).n,1)
    await user(bob)
    await assert.rejects(db.query('SELECT public.set_question_target_with_note($1,$2,$3,30,$4)',[alice,subject,'2026-10-10','Konu']),/Access denied/)
    await user(alice)
    await assert.rejects(notedTarget('x'.repeat(1001)),/Invalid target/)
    assert.ok(await notedTarget('📚'.repeat(500)))
    const weekTargets = [{date:'2026-10-12',target:40,note:'Paragraf'}, {date:'2026-10-13',target:35,note:'Anlam ilişkileri'}]
    const saveWeek = entries => db.query("SELECT public.save_question_week_targets_with_notes($1,$2,'2026-10-12',$3::jsonb)",[alice,subject,JSON.stringify(entries)])
    await saveWeek(weekTargets); await saveWeek(weekTargets)
    assert.equal((await value("SELECT count(*)::int AS n FROM public.question_plans WHERE date BETWEEN '2026-10-12' AND '2026-10-13' AND subject_id=$1",[subject])).n,2)
    const beforeAtomic = await value("SELECT sum(target_questions)::int AS n FROM public.question_plans WHERE date BETWEEN '2026-10-12' AND '2026-10-13' AND subject_id=$1",[subject])
    await assert.rejects(saveWeek([{...weekTargets[0],target:70},{...weekTargets[1],note: {topic:'not text'}}]),/Invalid question note/)
    assert.deepEqual(await value("SELECT sum(target_questions)::int AS n FROM public.question_plans WHERE date BETWEEN '2026-10-12' AND '2026-10-13' AND subject_id=$1",[subject]),beforeAtomic)
    await db.query('SELECT public.set_question_target($1,$2,$3,45,$4,NULL,$5)',[alice,subject,'2026-10-10','day',topicA])
    assert.equal((await value('SELECT note FROM public.question_plans WHERE id=$1',[topicA])).note,'Sözcükte anlam')
    await db.exec('RESET ROLE')
    const allRows = (await db.query('SELECT * FROM public.question_plans ORDER BY id')).rows
    const allLogs = (await db.query('SELECT * FROM public.question_session_results ORDER BY id')).rows
    await db.exec(migration)
    assert.deepEqual((await db.query('SELECT * FROM public.question_plans ORDER BY id')).rows,allRows)
    assert.deepEqual((await db.query('SELECT * FROM public.question_session_results ORDER BY id')).rows,allLogs)
    console.log('PASS separate topics, strict manual/timed attribution, immutable history, atomic week notes and idempotent upgrade')
    await user(alice)
    const copyPrevious = async () => (await value("SELECT public.copy_previous_question_week($1,'2026-10-19') AS result",[alice])).result
    const beforeCopy = await value('SELECT (SELECT count(*) FROM public.question_session_results)::int AS logs, (SELECT count(*) FROM public.study_sessions)::int AS sessions')
    await target(alice,subject,'2026-10-19',70)
    const firstCopy = await copyPrevious()
    assert.equal(firstCopy.copied,2)
    assert.equal((await value("SELECT target_questions FROM public.question_plans WHERE date='2026-10-19' AND subject_id=$1 AND note IS NULL",[subject])).target_questions,70)
    const copiedTopic = await value("SELECT * FROM public.question_plans WHERE date='2026-10-19' AND subject_id=$1 AND note='Paragraf'",[subject])
    assert.equal(copiedTopic.target_questions,40)
    assert.equal(copiedTopic.video_plan_item_id,null)
    assert.equal(copiedTopic.kind,'extra')
    await target(alice,subject,'2026-10-19',99,'day',null,copiedTopic.id)
    assert.deepEqual(await copyPrevious(),{copied:0,skipped:2})
    assert.equal((await value('SELECT target_questions FROM public.question_plans WHERE id=$1',[copiedTopic.id])).target_questions,99)
    assert.deepEqual(await value('SELECT (SELECT count(*) FROM public.question_session_results)::int AS logs, (SELECT count(*) FROM public.study_sessions)::int AS sessions'),beforeCopy)
    await user(bob)
    await assert.rejects(copyPrevious(),/Access denied/)
    await user(null)
    await assert.rejects(copyPrevious(),/Access denied/)
    await user(admin)
    assert.deepEqual(await copyPrevious(),{copied:0,skipped:2})
    console.log('PASS previous-week topic copy, existing goals preserved, retry idempotence, no copied logs/time and owner/admin authorization')
    await user(alice)
    const transfer = async (planId, expected, date, mode) => (await value('SELECT public.transfer_question_target($1,$2,$3,$4) AS result',[planId,expected,date,mode])).result
    await db.exec('RESET ROLE')
    const savedLogs = (await db.query('SELECT * FROM public.question_session_results ORDER BY id')).rows
    const priorCounts = await value('SELECT (SELECT count(*) FROM public.question_session_results)::int AS logs, (SELECT count(*) FROM public.study_sessions)::int AS sessions')
    await user(alice)
    const sourceBefore = await value('SELECT * FROM public.question_plans WHERE id=$1',[topicA])
    const duplicate = await transfer(topicA,'2026-10-10','2026-11-01','copy')
    assert.equal(duplicate.status,'copy'); assert.notEqual(duplicate.id,topicA)
    const newGoal = await value('SELECT * FROM public.question_plans WHERE id=$1',[duplicate.id])
    assert.equal(newGoal.note,sourceBefore.note)
    assert.equal(newGoal.target_questions,sourceBefore.target_questions)
    assert.equal(new Date(newGoal.date).toISOString().slice(0,10),'2026-11-01')
    assert.equal(newGoal.video_plan_item_id,null)
    assert.equal((await value('SELECT count(*)::int AS n FROM public.question_session_results WHERE question_plan_id=$1',[duplicate.id])).n,0)
    assert.deepEqual(await value('SELECT * FROM public.question_plans WHERE id=$1',[topicA]),sourceBefore)
    assert.equal((await transfer(topicA,'2026-10-10','2026-11-01','copy')).status,'exists')
    assert.equal((await transfer(topicA,'2026-10-10','2026-11-02','move')).id,topicA)
    assert.equal((await value('SELECT date::text AS date FROM public.question_plans WHERE id=$1',[topicA])).date,'2026-11-02')
    assert.equal((await transfer(topicA,'2026-11-02','2026-11-01','move')).status,'exists')
    assert.equal((await value('SELECT date::text AS date FROM public.question_plans WHERE id=$1',[topicA])).date,'2026-11-02')
    await assert.rejects(transfer(topicA,'2026-10-10','2026-11-03','move'),/QUESTION_TRANSFER_STALE/)
    await assert.rejects(transfer(topicA,'2026-11-02','infinity','copy'),/Invalid transfer/)
    await assert.rejects(transfer(topicA,'2026-11-02','2026-11-03','bad'),/Invalid transfer/)
    await target(alice,subject,'2026-11-05',25,'day',video,videoPlan)
    const videoCopy = await transfer(videoPlan,'2026-11-05','2026-11-06','copy')
    const videoCopyRow = await value('SELECT * FROM public.question_plans WHERE id=$1',[videoCopy.id])
    assert.equal(videoCopyRow.video_plan_item_id,null)
    assert.equal(videoCopyRow.resource_id,resource)
    assert.equal(videoCopyRow.kind,'extra')
    await user(bob)
    await assert.rejects(transfer(topicA,'2026-11-02','2026-11-03','copy'),/Access denied/)
    await user(null)
    await assert.rejects(transfer(topicA,'2026-11-02','2026-11-03','copy'),/Access denied/)
    await user(admin)
    assert.equal((await transfer(topicA,'2026-11-02','2026-11-03','copy')).status,'copy')
    await db.exec('RESET ROLE')
    assert.deepEqual((await db.query('SELECT * FROM public.question_session_results ORDER BY id')).rows,savedLogs)
    assert.deepEqual(await value('SELECT (SELECT count(*) FROM public.question_session_results)::int AS logs, (SELECT count(*) FROM public.study_sessions)::int AS sessions'),priorCounts)
    console.log('PASS single-goal move/copy, source and history preservation, zero-progress copy, conflicts/retries, stale dates and authorization')



  } finally { await db.close() }
}
try {
  await scenario()
  if (process.env.OLD_QUESTION_MIGRATION) await scenario(await readFile(process.env.OLD_QUESTION_MIGRATION, 'utf8'))
} catch (error) {
  console.error('SQL CHECK FAILED:', error.message, error.code || '', error.where || '')
  process.exitCode = 1
}
