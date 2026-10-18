// Local PostgreSQL only; never connects to the live Supabase project.
// TOPIC_TEST_DB_MODULE=file:///tmp/ags-source-db-check/node_modules/@electric-sql/pglite/dist/index.js node tests/database/agsTopicSource.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite }=await import(process.env.TOPIC_TEST_DB_MODULE || '@electric-sql/pglite')
const base=await readFile(new URL('../../supabase/migrations/shared_ags_topics_monthly.sql',import.meta.url),'utf8')
const migration=await readFile(new URL('../../supabase/migrations/ags_topic_source.sql',import.meta.url),'utf8')
const db=new PGlite(), id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const admin=id(1),alice=id(2),bob=id(3),fresh=id(4)
const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0]
const user=async uid=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('SET ROLE authenticated')}
const setSource=async(owner,source)=>(await value('SELECT public.set_ags_topic_source($1,$2) AS source',[owner,source])).source
const snapshot=async()=>value(`SELECT jsonb_build_object(
 'personal',(SELECT jsonb_agg(t ORDER BY id) FROM public.topics t),
 'shared',(SELECT jsonb_agg(t ORDER BY id) FROM public.ags_shared_topics t),
 'progress',(SELECT jsonb_agg(t ORDER BY user_id,topic_id) FROM public.ags_topic_progress t),
 'monthly',(SELECT jsonb_agg(t ORDER BY id) FROM public.monthly_topic_targets t)) AS data`)
try{
  await db.exec(`
    CREATE ROLE anon;CREATE ROLE authenticated;
    CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text DEFAULT 'user');
    CREATE TABLE public.exams(id uuid PRIMARY KEY,user_id uuid,name text);
    CREATE TABLE public.subjects(id uuid PRIMARY KEY,user_id uuid,exam_id uuid REFERENCES public.exams,name text);
    CREATE TABLE public.topics(id uuid PRIMARY KEY,user_id uuid,subject_id uuid REFERENCES public.subjects,title text,is_completed boolean DEFAULT false,sort_order integer DEFAULT 0);
    GRANT SELECT ON public.profiles,public.exams,public.subjects,public.topics TO authenticated;
    GRANT UPDATE ON public.profiles TO authenticated;
    INSERT INTO auth.users VALUES('${admin}'),('${alice}'),('${bob}'),('${fresh}');
    INSERT INTO public.profiles VALUES('${admin}','admin'),('${alice}','user'),('${bob}','user'),('${fresh}','user');
    INSERT INTO public.exams VALUES('${id(10)}','${admin}','AGS');
    INSERT INTO public.subjects VALUES('${id(11)}','${admin}','${id(10)}','Tarih');
    INSERT INTO public.topics VALUES('${id(12)}','${admin}','${id(11)}','Kişisel konu',true,0);
  `)
  await db.exec(base);await db.exec(migration)
  await user(admin)
  const subject=(await value("SELECT id FROM public.ags_shared_subjects WHERE name='Tarih'")).id
  await db.query('SELECT public.save_ags_shared_topics($1,$2)',[subject,['Ortak konu']])
  const topic=(await value("SELECT id FROM public.ags_shared_topics WHERE title='Ortak konu'")).id
  await db.query('SELECT public.set_ags_topic_completion($1,$2,true)',[alice,topic])
  await db.query('SELECT public.set_ags_topic_completion($1,$2,false)',[bob,topic])
  await db.query('SELECT public.save_monthly_topic_targets($1::jsonb)',[JSON.stringify([{kind:'shared',topic_id:topic,month:'2026-11'},{kind:'personal',topic_id:id(12),month:'2026-12'}])])
  const original=await snapshot()
  await user(alice)
  assert.equal((await value('SELECT count(*)::int AS n FROM public.ags_topic_preferences')).n,0)
  assert.equal(await setSource(alice,'shared'),'shared')
  assert.equal(await setSource(alice,'personal'),'personal')
  assert.equal(await setSource(alice,'shared'),'shared')
  assert.equal((await value('SELECT count(*)::int AS n FROM public.ags_topic_preferences')).n,1)
  await assert.rejects(setSource(bob,'personal'),/Access denied/)
  for(const source of [null,'both',''])await assert.rejects(setSource(alice,source),/Invalid topic source/)
  await assert.rejects(db.query("UPDATE public.ags_topic_preferences SET source='personal' WHERE user_id=$1",[alice]),/permission denied/)
  await assert.rejects(db.query("UPDATE public.profiles SET role='admin' WHERE id=$1",[alice]),/server administrator/)
  await user(bob)
  assert.equal((await value('SELECT count(*)::int AS n FROM public.ags_topic_preferences')).n,0)
  await setSource(bob,'personal')
  assert.equal((await value('SELECT source FROM public.ags_topic_preferences')).source,'personal')
  await user(fresh)
  assert.equal((await value('SELECT count(*)::int AS n FROM public.ags_topic_preferences')).n,0)
  console.log('PASS explicit first choice, account isolation, owner writes, invalid-source and direct-write denial')
  await user(admin)
  await setSource(bob,'shared')
  assert.equal((await value('SELECT count(*)::int AS n FROM public.ags_topic_preferences')).n,2)
  await setSource(admin,'personal');await setSource(admin,'shared')
  assert.deepEqual(await snapshot(),original)
  await user(null);await assert.rejects(setSource(alice,'shared'),/Access denied/)
  assert.equal((await value("SELECT has_function_privilege('anon','public.set_ags_topic_source(uuid,text)','EXECUTE') AS allowed")).allowed,false)
  console.log('PASS verified admin impersonation, anonymous denial and switching never changes topics, completions or monthly plans')
  await db.exec('RESET ROLE')
  const preferences=(await db.query('SELECT user_id,source FROM public.ags_topic_preferences ORDER BY user_id')).rows
  await db.exec(migration)
  assert.deepEqual((await db.query('SELECT user_id,source FROM public.ags_topic_preferences ORDER BY user_id')).rows,preferences)
  assert.deepEqual(await snapshot(),original)
  console.log('PASS repeat migration preserves saved choices and all existing study-topic data')
}catch(error){console.error('SQL CHECK FAILED:',error.message,error.code||'',error.where||'');process.exitCode=1}
finally{await db.close()}
