// Local PostgreSQL only. Never reads or modifies the live Supabase database.
// QUESTION_TEST_DB_MODULE=file:///tmp/question-db/node_modules/@electric-sql/pglite/dist/index.js node tests/database/questionWeeks.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.QUESTION_TEST_DB_MODULE || '@electric-sql/pglite')
const migration = await readFile(new URL('../../supabase/migrations/question_plans.sql', import.meta.url), 'utf8')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const alice=id(1), bob=id(2), admin=id(3), math=id(10), verbal=id(11), yds=id(12), bobMath=id(20), bobVerbal=id(21), bobYds=id(22)
const db = new PGlite()
const value = async (sql, args=[]) => (await db.query(sql, args)).rows[0]
const user = async uid => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid || '']); await db.exec('SET ROLE authenticated') }
const target = async (owner,subject,date,count,period='day',video=null) => (await value('SELECT public.set_question_target($1,$2,$3,$4,$5,$6) AS id',[owner,subject,date,count,period,video])).id
const save = async (owner,subject,targets) => (await value("SELECT public.save_question_week_targets($1,$2,'2026-10-19',$3::jsonb) AS result",[owner,subject,JSON.stringify(targets)])).result
const copy = async () => (await value("SELECT public.copy_question_week($1,$2,'2026-10-19') AS result",[alice,bob])).result
const counts = async owner => value('SELECT count(*)::int AS n, sum(target_questions)::int AS total FROM public.question_plans WHERE user_id=$1 AND archived_at IS NULL AND target_questions > 0',[owner])
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text NOT NULL);
    CREATE TABLE public.exams(id uuid PRIMARY KEY, user_id uuid NOT NULL, name text NOT NULL);
    CREATE TABLE public.subjects(id uuid PRIMARY KEY, user_id uuid NOT NULL, exam_id uuid REFERENCES public.exams, name text NOT NULL);
    CREATE TABLE public.resources(id uuid PRIMARY KEY, user_id uuid NOT NULL, subject_id uuid REFERENCES public.subjects);
    CREATE TABLE public.video_plan_items(id uuid PRIMARY KEY,user_id uuid NOT NULL,resource_id uuid REFERENCES public.resources);
    CREATE TABLE public.study_sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,subject_id uuid,resource_id uuid,session_type text,started_at timestamptz,ended_at timestamptz,duration_minutes numeric(12,6));
    GRANT SELECT ON public.profiles,public.exams,public.subjects,public.resources,public.video_plan_items,public.study_sessions TO authenticated;
    INSERT INTO auth.users VALUES ('${alice}'),('${bob}'),('${admin}');
    INSERT INTO public.profiles VALUES ('${alice}','user'),('${bob}','user'),('${admin}','admin');
    INSERT INTO public.exams VALUES ('${id(30)}','${alice}','AGS'),('${id(31)}','${bob}','MEB-AGS'),('${id(32)}','${alice}','YDS'),('${id(33)}','${bob}','YDS');
    INSERT INTO public.subjects VALUES ('${math}','${alice}','${id(30)}','Sayısal Yetenek'),('${verbal}','${alice}','${id(30)}','Sözel Yetenek'),('${yds}','${alice}','${id(32)}','Sayısal Yetenek'),('${bobMath}','${bob}','${id(31)}',' Sayısal  Yetenek '),('${bobVerbal}','${bob}','${id(31)}','Sözel Yetenek'),('${bobYds}','${bob}','${id(33)}','Sayısal Yetenek');
    INSERT INTO public.resources VALUES ('${id(40)}','${alice}','${math}');
    INSERT INTO public.video_plan_items VALUES ('${id(41)}','${alice}','${id(40)}'),('${id(42)}','${alice}','${id(40)}');
  `)
  await db.exec(migration)
  await user(alice)
  const payload = Array.from({length:7},(_,i)=>({date:`2026-10-${19+i}`,target:20+i*5}))
  assert.deepEqual(await save(alice,math,payload),{saved:7})
  assert.deepEqual(await save(alice,math,payload),{saved:7})
  assert.equal((await counts(alice)).n,7)
  const before = await counts(alice)
  for (const invalid of [[{date:'2026-10-19',target:55},{date:'2026-10-26',target:40}], [{date:'2026-10-19',target:2.5}], [{date:'2026-10-19',target:0}], [{date:'2026-10-19',target:20},{date:'2026-10-19',target:30}], [{date:'2026-10-19',target:'45'}]]) await assert.rejects(save(alice,math,invalid))
  assert.deepEqual(await counts(alice),before)
  await assert.rejects(save(bob,bobMath,payload), /Access denied/)
  await assert.rejects(save(alice,bobMath,payload), /Subject not found/)
  console.log('PASS atomic seven-day save, retry idempotence, exact dates, numeric validation and ownership')

  await target(alice,math,'2026-10-21',30,'day',id(41))
  await target(alice,math,'2026-10-21',20,'day',id(42))
  const verbalPlan = await target(alice,verbal,'2026-10-20',45)
  const weekGoal = await target(alice,yds,'2026-10-19',200,'week')
  await target(alice,verbal,'2026-10-18',50)
  await target(alice,verbal,'2026-10-26',50)
  const archived = await target(alice,verbal,'2026-10-22',100)
  await db.query('SELECT public.archive_question_plan($1)',[archived])
  await db.query('SELECT public.add_solved_questions($1,$2,15)',[id(50),verbalPlan])
  await assert.rejects(copy(), /Access denied/)
  await user(null); await assert.rejects(copy(), /Access denied/)
  await user(bob)
  const existing = await target(bob,bobMath,'2026-10-19',99)
  await db.query('SELECT public.add_solved_questions($1,$2,10)',[id(51),existing])
  await user(admin)
  const result = await copy()
  assert.deepEqual(result,{copied:8,skipped:1})
  assert.deepEqual(await copy(),{copied:0,skipped:9})
  assert.equal((await value('SELECT target_questions FROM public.question_plans WHERE id=$1',[existing])).target_questions,99)
  assert.equal((await value("SELECT target_questions FROM public.question_plans WHERE user_id=$1 AND subject_id=$2 AND date='2026-10-21'",[bob,bobMath])).target_questions,80)
  assert.equal((await value('SELECT count(*)::int AS n FROM public.question_plans WHERE user_id=$1 AND (video_plan_item_id IS NOT NULL OR resource_id IS NOT NULL)',[bob])).n,0)
  assert.equal((await value('SELECT count(*)::int AS n FROM public.question_session_results WHERE user_id=$1',[bob])).n,1)
  assert.equal((await value("SELECT count(*)::int AS n FROM public.question_plans WHERE user_id=$1 AND subject_id=$2 AND period='week' AND date='2026-10-19'",[bob,bobYds])).n,1)
  assert.equal((await value("SELECT count(*)::int AS n FROM public.question_plans WHERE user_id=$1 AND subject_id=$2 AND date='2026-10-22'",[bob,bobVerbal])).n,0)
  assert.equal((await value("SELECT count(*)::int AS n FROM public.question_plans WHERE user_id=$1 AND (date<'2026-10-19' OR date>'2026-10-25')",[bob])).n,0)
  assert.ok(weekGoal)
  console.log('PASS admin copies exact lesson/dates, combines same-day videos, preserves existing targets/logs and repeated paste adds nothing')

  // A missing/ambiguous mapping rolls the entire operation back, including earlier items.
  await target(alice,verbal,'2026-10-23',60)
  await db.exec('RESET ROLE')
  await db.exec(`INSERT INTO public.subjects VALUES ('${id(60)}','${alice}','${id(30)}','Eksik Ders')`)
  await user(admin)
  await target(alice,id(60),'2026-10-25',20)
  const bobBefore = await counts(bob)
  await assert.rejects(copy(), /QUESTION_COPY_SUBJECT_MAPPING/)
  assert.deepEqual(await counts(bob),bobBefore)
  const missingPlan = (await value('SELECT id FROM public.question_plans WHERE user_id=$1 AND subject_id=$2',[alice,id(60)])).id
  await db.query('SELECT public.archive_question_plan($1)',[missingPlan])
  await db.exec('RESET ROLE')
  await db.exec(`INSERT INTO public.subjects VALUES ('${id(61)}','${bob}','${id(31)}','Sözel Yetenek')`)
  await user(admin)
  await assert.rejects(copy(), /QUESTION_COPY_SUBJECT_MAPPING/)
  assert.deepEqual(await counts(bob),bobBefore)
  await assert.rejects(db.query("SELECT public.copy_question_week($1,$1,'2026-10-19')",[alice]), /Invalid copy target/)
  await db.exec('RESET ROLE')
  await db.exec(`INSERT INTO public.subjects VALUES ('${id(62)}','${alice}','${id(30)}','Sözel Yetenek')`)
  await user(admin)
  await target(alice,id(62),'2026-10-20',25)
  await assert.rejects(copy(), /QUESTION_COPY_SOURCE_AMBIGUOUS/)
  assert.deepEqual(await counts(bob),bobBefore)
  assert.equal((await value("SELECT has_function_privilege('anon','public.copy_question_week(uuid,uuid,date)','EXECUTE') AS allowed")).allowed,false)
  console.log('PASS missing/ambiguous subject mapping rolls back, same-account copy and anonymous execution rejected')
  await db.exec('RESET ROLE')
  const totalBefore = await value('SELECT (SELECT count(*) FROM public.question_plans)::int AS plans,(SELECT count(*) FROM public.question_session_results)::int AS logs')
  await db.exec(migration)
  assert.deepEqual(await value('SELECT (SELECT count(*) FROM public.question_plans)::int AS plans,(SELECT count(*) FROM public.question_session_results)::int AS logs'),totalBefore)
  console.log('PASS updated migration reruns without removing plans, question logs or study records')
} catch (error) { console.error('SQL CHECK FAILED:', error.message,error.code || '',error.where || ''); process.exitCode=1 }
finally { await db.close() }
