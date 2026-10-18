// Local PostgreSQL only; never connects to the live Supabase project.
// TOPIC_TEST_DB_MODULE=file:///tmp/monthly-sharing-db-check/node_modules/@electric-sql/pglite/dist/index.js node tests/database/monthlyPlanSharing.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite }=await import(process.env.TOPIC_TEST_DB_MODULE || '@electric-sql/pglite')
const sql=async file=>readFile(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8')
const migration=await sql('monthly_plan_sharing.sql')
const db=new PGlite(), id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const admin=id(1),admin2=id(2),alice=id(3),bob=id(4)
const query=async(sql,args=[]) => (await db.query(sql,args)).rows
const value=async(sql,args=[]) => (await query(sql,args))[0]
const user=async uid=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('SET ROLE authenticated')}
const share=async(viewer,allowed)=>(await value('SELECT public.set_monthly_plan_viewer($1,$2) AS result',[viewer,allowed])).result
const plans=()=>query('SELECT * FROM public.get_accessible_monthly_plans()')
const snapshot=async owner=>(await value('SELECT public.get_shared_monthly_plan($1) AS result',[owner])).result
const source=async(owner,choice)=>db.query('SELECT public.set_ags_topic_source($1,$2)',[owner,choice])
const plan=async(topic,kind='shared',month='2026-11')=>db.query('SELECT public.save_monthly_topic_targets($1::jsonb)',[JSON.stringify([{kind,topic_id:topic,month,note:'Aylık hedef notu'}])])
const preserved=async()=>{
  const role=(await value('SELECT current_user AS role')).role
  await db.exec('RESET ROLE')
  const result=await value(`SELECT jsonb_build_object(
 'targets',(SELECT jsonb_agg(t ORDER BY id) FROM public.monthly_topic_targets t),
 'personal',(SELECT jsonb_agg(t ORDER BY id) FROM public.topics t),
 'progress',(SELECT jsonb_agg(t ORDER BY user_id,topic_id) FROM public.ags_topic_progress t)) AS data`)
  if(role==='authenticated')await db.exec('SET ROLE authenticated')
  return result
}
try {
  await db.exec(`
    CREATE ROLE anon;CREATE ROLE authenticated;
    CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text DEFAULT 'user',display_name text);
    CREATE TABLE public.exams(id uuid PRIMARY KEY,user_id uuid,name text,base_template_key text);
    CREATE TABLE public.subjects(id uuid PRIMARY KEY,user_id uuid,exam_id uuid REFERENCES public.exams,name text);
    CREATE TABLE public.topics(id uuid PRIMARY KEY,user_id uuid,subject_id uuid REFERENCES public.subjects,title text,is_completed boolean DEFAULT false,sort_order integer DEFAULT 0);
    GRANT SELECT ON public.profiles,public.exams,public.subjects,public.topics TO authenticated;
    GRANT UPDATE ON public.profiles TO authenticated;
    ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_exams ON public.exams FOR SELECT TO authenticated USING(user_id=auth.uid());
    CREATE POLICY own_subjects ON public.subjects FOR SELECT TO authenticated USING(user_id=auth.uid());
    CREATE POLICY own_topics ON public.topics FOR SELECT TO authenticated USING(user_id=auth.uid());
    INSERT INTO auth.users VALUES('${admin}'),('${admin2}'),('${alice}'),('${bob}');
    INSERT INTO public.profiles VALUES('${admin}','admin','Süleyman'),('${admin2}','admin','Diğer yönetici'),('${alice}','user','Alice'),('${bob}','user','Bob');
    INSERT INTO public.exams VALUES('${id(10)}','${admin}','Yeniden adlandırılmış AGS','ags'),('${id(11)}','${admin}','YDS','yds');
    INSERT INTO public.subjects VALUES('${id(20)}','${admin}','${id(10)}','Tarih'),('${id(21)}','${admin}','${id(11)}','Kelime');
    INSERT INTO public.topics VALUES('${id(30)}','${admin}','${id(20)}','Kişisel AGS konusu',true,0),('${id(31)}','${admin}','${id(21)}','Planlanmış YDS konusu',true,0),('${id(32)}','${admin}','${id(21)}','Özel planlanmamış konu',true,1);
  `)
  await db.exec(await sql('shared_ags_topics_monthly.sql'))
  await db.exec(await sql('ags_topic_source.sql'))
  await db.exec(migration)
  await user(admin)
  const subject=(await value("SELECT id FROM public.ags_shared_subjects WHERE name='Tarih'")).id
  await db.query('SELECT public.save_ags_shared_topics($1,$2)',[subject,['Ortak tarih konusu','Planlanmamış ortak konu']])
  const topic=(await value("SELECT id FROM public.ags_shared_topics WHERE title='Ortak tarih konusu'")).id
  await source(admin,'shared');await source(admin2,'shared');await source(alice,'personal')
  await db.query('SELECT public.set_ags_topic_completion($1,$2,true)',[admin,topic])
  await plan(topic);await plan(id(30),'personal');await plan(id(31),'personal')
  await user(admin2);await plan(topic,'shared','2026-12')
  assert.deepEqual((await plans()).map(p=>[p.plan_owner_id,p.can_edit]),[[admin2,true]])
  await assert.rejects(snapshot(admin),/Access denied/)
  await user(alice);assert.deepEqual(await plans(),[]);await assert.rejects(snapshot(admin),/Access denied/)
  await user(bob);assert.deepEqual(await plans(),[])
  console.log('PASS default private plans and separate admin ownership')

  await user(admin)
  const before=await preserved()
  assert.deepEqual(await share(alice,true),{viewer_id:alice,allowed:true});await share(alice,true)
  assert.equal((await value('SELECT count(*)::int AS n FROM public.monthly_plan_viewers')).n,1)
  for(const [viewer,allowed] of [[admin,true],[null,true],[id(999),true],[bob,null]]) await assert.rejects(share(viewer,allowed),/Invalid viewer/)
  await user(alice)
  assert.deepEqual((await plans()).map(p=>[p.plan_owner_id,p.owner_name,p.can_edit]),[[admin,'Süleyman',false]])
  let data=await snapshot(admin)
  assert.equal(data.owner_id,admin);assert.equal(data.agsTopicSource,'shared')
  assert.deepEqual(data.topics.map(t=>t.title).sort(),['Ortak tarih konusu','Planlanmış YDS konusu'].sort())
  assert.ok(data.topics.every(t=>t.completed===false));assert.ok(data.targets.every(t=>t.owner_id===admin))
  assert.equal(data.targets.length,2);assert.ok(data.targets.every(t=>t.note==='Aylık hedef notu'))
  assert.equal((await query('SELECT * FROM public.monthly_topic_targets')).length,0)
  assert.equal((await query('SELECT * FROM public.topics')).length,0)
  assert.equal((await query('SELECT * FROM public.subjects')).length,0)
  assert.equal((await query('SELECT * FROM public.ags_topic_progress')).length,0)
  await assert.rejects(snapshot(admin2),/Access denied/)
  await assert.rejects(share(bob,true),/Access denied/)
  await assert.rejects(plan(topic),/Access denied/)
  await assert.rejects(db.query('SELECT public.remove_monthly_topic_target($1)',[data.targets[0].id]),/Access denied/)
  await assert.rejects(db.query('INSERT INTO public.monthly_plan_viewers(plan_owner_id,viewer_id) VALUES($1,$2)',[admin2,alice]),/permission denied/)
  await assert.rejects(db.query('DELETE FROM public.monthly_plan_viewers WHERE viewer_id=$1',[alice]),/permission denied/)
  await assert.rejects(db.query("UPDATE public.profiles SET role='admin' WHERE id=$1",[alice]),/server administrator/)
  await user(bob);await assert.rejects(snapshot(admin),/Access denied/)
  console.log('PASS granted viewer sees only planned titles, no personal catalog/progress, cannot edit/share/escalate or read another plan')

  await user(admin);await source(admin,'personal')
  await user(alice);data=await snapshot(admin)
  assert.deepEqual(data.topics.map(t=>t.title).sort(),['Kişisel AGS konusu','Planlanmış YDS konusu'].sort())
  await db.exec('RESET ROLE');await db.query('DELETE FROM public.ags_topic_preferences WHERE user_id=$1',[admin])
  await user(alice);data=await snapshot(admin)
  assert.deepEqual(data.topics.map(t=>t.title),['Planlanmış YDS konusu'])
  await user(admin);await source(admin,'shared')
  assert.deepEqual(await preserved(),before)
  console.log('PASS shared view follows plan owner source without changing viewer choice or exposing hidden AGS topics')

  await user(admin2);await share(alice,true)
  assert.equal((await value('SELECT count(*)::int AS n FROM public.monthly_plan_viewers')).n,1)
  await user(alice);assert.equal((await plans()).length,2)
  assert.equal((await snapshot(admin2)).targets[0].target_month,'2026-12-01')
  assert.ok((await snapshot(admin)).targets.every(t=>t.target_month==='2026-11-01'))
  await user(admin);await share(alice,false);await share(alice,false)
  assert.deepEqual(await preserved(),before)
  await user(alice);await assert.rejects(snapshot(admin),/Access denied/)
  assert.deepEqual((await plans()).map(p=>p.plan_owner_id),[admin2])
  await user(admin);await share(alice,true)
  await db.exec('RESET ROLE');await db.query("UPDATE public.profiles SET role='user' WHERE id=$1",[admin])
  await user(alice);await assert.rejects(snapshot(admin),/Access denied/)
  assert.deepEqual((await plans()).map(p=>p.plan_owner_id),[admin2])
  await user(admin);await assert.rejects(share(bob,true),/Access denied/)
  await db.exec('RESET ROLE');await db.query("UPDATE public.profiles SET role='admin' WHERE id=$1",[admin])
  await user(admin);assert.deepEqual(await preserved(),before)
  console.log('PASS multiple shared plans stay isolated; revocation and role removal immediately deny server access while preserving records')

  await db.exec('RESET ROLE')
  const grants=await query('SELECT * FROM public.monthly_plan_viewers ORDER BY plan_owner_id,viewer_id')
  await db.exec(migration)
  assert.deepEqual(await query('SELECT * FROM public.monthly_plan_viewers ORDER BY plan_owner_id,viewer_id'),grants)
  assert.deepEqual(await preserved(),before)
  await user(null);assert.deepEqual(await plans(),[]);await assert.rejects(snapshot(admin),/Access denied/);await assert.rejects(share(alice,true),/Access denied/)
  for(const signature of ['public.set_monthly_plan_viewer(uuid,boolean)','public.get_accessible_monthly_plans()','public.get_shared_monthly_plan(uuid)']) assert.equal((await value("SELECT has_function_privilege('anon',$1,'EXECUTE') AS allowed",[signature])).allowed,false)
  await db.exec('RESET ROLE');await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM public.get_accessible_monthly_plans()'),/permission denied/)
  console.log('PASS idempotent migration and anonymous execution denial; original monthly/topic/progress rows preserved')
} catch(error) { console.error('SQL CHECK FAILED:',error.message,error.code||'',error.where||'');process.exitCode=1 }
finally { await db.close() }
