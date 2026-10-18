// Local PostgreSQL only. No live Supabase connection is used.
// TOPIC_TEST_DB_MODULE=file:///tmp/topic-db/node_modules/@electric-sql/pglite/dist/index.js node tests/database/sharedMonthlyTopics.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.TOPIC_TEST_DB_MODULE || '@electric-sql/pglite')
const migration = await readFile(new URL('../../supabase/migrations/shared_ags_topics_monthly.sql', import.meta.url),'utf8')
const db = new PGlite()
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const admin=id(1), admin2=id(2), alice=id(3), bob=id(4)
const value = async (sql,args=[]) => (await db.query(sql,args)).rows[0]
const user = async uid => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid || '']); await db.exec('SET ROLE authenticated') }
const saveTopics = async (subject,titles,topic=null) => (await value('SELECT public.save_ags_shared_topics($1,$2,$3) AS result',[subject,titles,topic])).result
const plan = async items => (await value('SELECT public.save_monthly_topic_targets($1::jsonb) AS result',[JSON.stringify(items)])).result
const item = (topic,month='2026-11',kind='shared') => ({kind,topic_id:topic,month,note:null})
const targets = async () => (await db.query('SELECT id,owner_id,shared_topic_id,personal_topic_id,target_month::text,note,updated_at FROM public.monthly_topic_targets ORDER BY id')).rows
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text DEFAULT 'user');
    CREATE TABLE public.exams(id uuid PRIMARY KEY,user_id uuid,name text);
    CREATE TABLE public.subjects(id uuid PRIMARY KEY,user_id uuid,exam_id uuid REFERENCES public.exams,name text);
    CREATE TABLE public.topics(id uuid PRIMARY KEY,user_id uuid,subject_id uuid REFERENCES public.subjects,title text,is_completed boolean DEFAULT false,sort_order integer DEFAULT 0);
    GRANT SELECT ON public.profiles,public.exams,public.subjects,public.topics TO authenticated;
    GRANT UPDATE,INSERT ON public.profiles TO authenticated;
    INSERT INTO auth.users VALUES ('${admin}'),('${admin2}'),('${alice}'),('${bob}');
    INSERT INTO public.profiles VALUES ('${admin}','admin'),('${admin2}','admin'),('${alice}','user'),('${bob}','user');
    INSERT INTO public.exams VALUES ('${id(10)}','${admin}','AGS'),('${id(11)}','${admin}','YDS'),('${id(12)}','${alice}','AGS');
    INSERT INTO public.subjects VALUES ('${id(20)}','${admin}','${id(10)}','Tarih'),('${id(21)}','${admin}','${id(11)}','Kelime'),('${id(22)}','${alice}','${id(12)}','Tarih');
    INSERT INTO public.topics VALUES ('${id(30)}','${admin}','${id(20)}','Kişisel AGS başlığım',true,0),('${id(31)}','${admin}','${id(21)}','Özel YDS başlığım',false,0),('${id(32)}','${alice}','${id(22)}','Başka kullanıcının özel konusu',true,0);
  `)
  await db.exec(migration)
  await user(admin)
  assert.equal((await value('SELECT count(*)::int AS n FROM public.ags_shared_subjects')).n,6)
  const subject = (await value("SELECT public.save_ags_shared_subject('Sayısal Yetenek') AS id")).id
  assert.deepEqual(await saveTopics(subject,['Sayılar','Problemler']),{saved:2})
  await saveTopics(subject,[' Sayılar ','Problemler'])
  assert.equal((await value('SELECT count(*)::int AS n FROM public.ags_shared_topics')).n,2)
  const topic=(await value("SELECT id FROM public.ags_shared_topics WHERE title='Sayılar'")).id
  const other=(await value("SELECT id FROM public.ags_shared_topics WHERE title='Problemler'")).id
  await db.query('SELECT public.set_ags_topic_completion($1,$2,true)',[admin,topic])
  await user(alice)
  assert.equal((await value('SELECT count(*)::int AS n FROM public.ags_shared_topics')).n,2)
  assert.equal((await value('SELECT count(*)::int AS n FROM public.ags_topic_progress')).n,0)
  await db.query('SELECT public.set_ags_topic_completion($1,$2,true)',[alice,topic])
  assert.equal((await value('SELECT is_completed FROM public.ags_topic_progress WHERE topic_id=$1',[topic])).is_completed,true)
  await assert.rejects(db.query('SELECT public.set_ags_topic_completion($1,$2,true)',[bob,topic]),/Access denied/)
  await assert.rejects(saveTopics(subject,['Hacked']),/Access denied/)
  await assert.rejects(db.query("UPDATE public.ags_shared_topics SET title='Hacked' WHERE id=$1",[topic]),/permission denied/)
  await assert.rejects(db.query("UPDATE public.profiles SET role='admin' WHERE id=$1",[alice]),/server administrator/)
  await assert.rejects(plan([item(topic)]),/Access denied/)
  await user(bob)
  assert.equal((await value('SELECT count(*)::int AS n FROM public.ags_topic_progress')).n,0)
  await user(admin)
  assert.equal((await value('SELECT count(*)::int AS n FROM public.ags_topic_progress WHERE topic_id=$1',[topic])).n,2)
  console.log('PASS shared titles visible to all accounts, completion isolated per user and owner/admin authorization enforced')

  assert.deepEqual(await plan([item(topic),item(id(31),'2026-12','personal')]),{saved:2})
  const first=(await targets()).find(row=>row.shared_topic_id===topic)
  await plan([item(topic,'2027-01')]); await plan([item(topic,'2027-01')])
  assert.equal((await targets()).length,2)
  assert.equal((await targets()).find(row=>row.id===first.id).target_month,'2027-01-01')
  for(const invalid of [[item(other),item(id(32),'2026-12','personal')],[item(other),item(topic,'2026-13')],[item(topic,'2026-12-01')],[item(topic,'2101-01')],[{...item(topic),note:'x'.repeat(1001)}],[{...item(topic),note:{invalid:true}}],[item(id(999))]]) {
    const before=await targets(); await assert.rejects(plan(invalid)); assert.deepEqual(await targets(),before)
  }
  await user(alice); assert.equal((await targets()).length,0)
  await user(admin2); assert.equal((await targets()).length,0)
  await db.query('SELECT public.remove_monthly_topic_target($1)',[first.id])
  await user(admin); assert.equal((await targets()).length,2)
  await db.exec('RESET ROLE'); await db.exec(`UPDATE public.profiles SET role='user' WHERE id='${admin}'`)
  await user(admin); assert.equal((await targets()).length,0); await assert.rejects(plan([item(topic)]),/Access denied/)
  await db.exec('RESET ROLE'); await db.exec(`UPDATE public.profiles SET role='admin' WHERE id='${admin}'`)
  await user(admin)
  console.log('PASS admin-only monthly RLS, separate admin plans, exact months, move/retry idempotence and full rollback on invalid/foreign topics')

  await db.query('SELECT public.archive_ags_shared_topic($1)',[topic])
  assert.equal((await targets()).length,2)
  assert.equal((await value('SELECT count(*)::int AS n FROM public.ags_topic_progress WHERE topic_id=$1',[topic])).n,2)
  await assert.rejects(plan([item(topic)]),/Topic not found/)
  await saveTopics(subject,['Sayılar'])
  assert.equal((await value("SELECT id FROM public.ags_shared_topics WHERE title='Sayılar'")).id,topic)
  assert.equal((await value('SELECT is_completed FROM public.ags_topic_progress WHERE user_id=$1 AND topic_id=$2',[alice,topic])).is_completed,true)
  await saveTopics(subject,['Sayılar ve sayı kümeleri'],topic)
  assert.equal((await targets()).find(row=>row.id===first.id).shared_topic_id,topic)
  await db.query('SELECT public.publish_existing_ags_topics()')
  await db.query('SELECT public.publish_existing_ags_topics()')
  assert.equal((await value("SELECT count(*)::int AS n FROM public.ags_shared_topics WHERE title='Kişisel AGS başlığım'")).n,1)
  assert.equal((await value("SELECT count(*)::int AS n FROM public.ags_shared_topics WHERE title IN ('Özel YDS başlığım','Başka kullanıcının özel konusu')")).n,0)
  assert.equal((await value('SELECT is_completed FROM public.topics WHERE id=$1',[id(30)])).is_completed,true)
  assert.equal((await value('SELECT count(*)::int AS n FROM public.topics')).n,3)
  await db.query('SELECT public.save_ags_shared_subject($1,$2)',['Sayısal Yetenek (düzenlendi)',subject])
  console.log('PASS archive/rename/re-add preserves progress and monthly links; explicit import publishes only the admin own AGS titles')

  await db.exec('RESET ROLE')
  const before=await value('SELECT (SELECT count(*) FROM public.ags_shared_topics)::int AS topics,(SELECT count(*) FROM public.ags_topic_progress)::int AS progress,(SELECT count(*) FROM public.monthly_topic_targets)::int AS monthly,(SELECT count(*) FROM public.ags_shared_subjects)::int AS subjects')
  await db.exec(migration)
  assert.deepEqual(await value('SELECT (SELECT count(*) FROM public.ags_shared_topics)::int AS topics,(SELECT count(*) FROM public.ags_topic_progress)::int AS progress,(SELECT count(*) FROM public.monthly_topic_targets)::int AS monthly,(SELECT count(*) FROM public.ags_shared_subjects)::int AS subjects'),before)
  await user(null); await assert.rejects(saveTopics(subject,['Anon']),/Access denied/)
  assert.equal((await value("SELECT has_function_privilege('anon','public.save_monthly_topic_targets(jsonb)','EXECUTE') AS allowed")).allowed,false)
  console.log('PASS rerunning migration preserves personal/shared data and anonymous execution is not granted')
} catch(error) { console.error('SQL CHECK FAILED:',error.message,error.code || '',error.where || '');process.exitCode=1 }
finally { await db.close() }
