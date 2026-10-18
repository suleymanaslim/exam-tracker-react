// Local PostgreSQL only; never connects to Supabase.
// EXAM_TEMPLATE_TEST_DB_MODULE=file:///tmp/community-db-check/node_modules/@electric-sql/pglite/dist/index.js node tests/database/examTemplates.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.EXAM_TEMPLATE_TEST_DB_MODULE || '@electric-sql/pglite')
const migration = await readFile(new URL('../../supabase/migrations/exam_templates.sql', import.meta.url), 'utf8')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const admin = id(1), alice = id(2), bob = id(3), otherAdmin = id(4), noProfile = id(5)
const sourceExam = id(10), sourceGrammar = id(11), sourceVocab = id(12), personalExam = id(20), personalType = id(21)
async function scenario(mode = 'unique') {
  const db = new PGlite()
  const user = async (uid, role = 'authenticated') => {
    await db.exec('RESET ROLE')
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid || ''])
    await db.exec(`SET ROLE ${role}`)
  }
  const value = async (sql, args = []) => (await db.query(sql, args)).rows[0]
  const apply = async (uid, key = null) => (await value('SELECT public.apply_exam_templates($1,$2) AS result', [uid, key])).result
  const publish = async examId => (await value('SELECT public.publish_exam_template($1) AS result', [examId])).result
  const examsFor = async uid => (await db.query('SELECT * FROM public.exams WHERE user_id=$1 ORDER BY name', [uid])).rows
  const typesFor = async examId => (await db.query('SELECT * FROM public.exam_question_types WHERE exam_id=$1 ORDER BY sort_order,id', [examId])).rows
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, anon;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id), role text);
      CREATE TABLE public.exams(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),name text,color text,wrong_penalty numeric,point_per_net numeric DEFAULT 1,exam_date date);
      CREATE TABLE public.exam_question_types(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),exam_id uuid REFERENCES public.exams(id),name text NOT NULL,sort_order integer DEFAULT 0,question_count integer DEFAULT 0);
      CREATE TABLE public.exam_results(id uuid PRIMARY KEY,exam_id uuid REFERENCES public.exams(id),user_id uuid REFERENCES auth.users(id));
      CREATE TABLE public.exam_result_details(id uuid PRIMARY KEY,result_id uuid REFERENCES public.exam_results(id),question_type_id uuid REFERENCES public.exam_question_types(id),correct_count integer);
      GRANT SELECT ON public.profiles, public.exams, public.exam_question_types, public.exam_results, public.exam_result_details TO authenticated;
      INSERT INTO auth.users VALUES ('${admin}'),('${alice}'),('${bob}'),('${otherAdmin}'),('${noProfile}');
      INSERT INTO public.profiles VALUES ('${admin}','admin'),('${alice}','user'),('${bob}','user'),('${otherAdmin}','admin');
      INSERT INTO public.exams(id,user_id,name,color,point_per_net) VALUES
        ('${sourceExam}','${admin}','YDS','#123456',1.25),('${personalExam}','${bob}','YDS','#abcdef',2),
        ('${id(30)}','${alice}','MEB-AGS','#987654',1),('${id(40)}','${bob}','AGS','#456789',1.5),
        ('${id(50)}','${alice}','ALES','#333333',2),('${id(90)}','${bob}','IELTS','#111111',3.5);
      UPDATE public.exams SET exam_date='2027-01-15' WHERE id='${id(30)}';
      UPDATE public.exams SET wrong_penalty=5 WHERE id='${id(50)}';
      INSERT INTO public.exam_question_types(id,user_id,exam_id,name,sort_order,question_count) VALUES
        ('${personalType}','${bob}','${personalExam}','Kişisel YDS',0,80),('${id(41)}','${bob}','${id(40)}','Kişisel AGS',0,10);
      INSERT INTO public.exam_results VALUES ('${id(60)}','${personalExam}','${bob}'),('${id(91)}','${id(90)}','${bob}');
      INSERT INTO public.exam_result_details VALUES ('${id(61)}','${id(60)}','${personalType}',70);
    `)
    if (mode !== 'missing') await db.exec(`INSERT INTO public.exam_question_types(id,user_id,exam_id,name,sort_order,question_count) VALUES ('${sourceGrammar}','${admin}','${sourceExam}','Dilbilgisi - Süleyman',2,74),('${sourceVocab}','${admin}','${sourceExam}','Kelime - Süleyman',7,6)`)
    if (mode === 'ambiguous') await db.exec(`INSERT INTO public.exams(id,user_id,name,color) VALUES ('${id(70)}','${otherAdmin}','YDS','#000000'); INSERT INTO public.exam_question_types(user_id,exam_id,name,question_count) VALUES ('${otherAdmin}','${id(70)}','Başka admin',80)`)
    await db.exec(migration)
    const initialCatalog = (await db.query('SELECT * FROM public.exam_templates ORDER BY template_key')).rows
    if (mode !== 'unique') {
      assert.deepEqual(initialCatalog.map(t => t.template_key), ['ags','ales','ielts'])
      assert.equal((await examsFor(noProfile)).length, 3)
      // An ambiguous source is never guessed. An explicit main-account action resolves it.
      if (mode === 'missing') await db.exec(`INSERT INTO public.exam_question_types(user_id,exam_id,name,question_count) VALUES ('${admin}','${sourceExam}','Ana YDS',80)`)
      await user(admin)
      const result = await publish(sourceExam)
      assert.equal(result.template_key, 'yds')
      assert.equal(result.accounts_checked, 5)
      assert.equal((await examsFor(noProfile)).length, 4)
      console.log(`PASS ${mode} YDS source is never guessed; explicit admin publishing fills every auth account`)
      return
    }
    assert.deepEqual(initialCatalog.map(t => t.template_key), ['ags','ales','ielts','yds'])
    const source = initialCatalog.find(t => t.template_key === 'yds')
    assert.equal(Number(source.point_per_net), 1.25); assert.equal(source.wrong_penalty, null)
    assert.deepEqual(source.question_types, [{ name: 'Dilbilgisi - Süleyman', question_count: 74 },{ name: 'Kelime - Süleyman', question_count: 6 }])
    assert.deepEqual((await typesFor(sourceExam)).map(t => t.id), [sourceGrammar, sourceVocab])
    for (const uid of [admin, alice, bob, otherAdmin, noProfile]) assert.equal((await examsFor(uid)).length, 4)
    const aliceYds = (await examsFor(alice)).find(e => e.name === 'YDS')
    assert.equal(Number(aliceYds.point_per_net), 1.25)
    assert.deepEqual((await typesFor(aliceYds.id)).map(t => [t.name, t.question_count]), source.question_types.map(t => [t.name,t.question_count]))
    assert.ok((await typesFor(aliceYds.id)).every(t => t.user_id === alice && ![sourceGrammar,sourceVocab].includes(t.id)))
    console.log('PASS exact main-account YDS snapshot and all current accounts receive separate owned bases')

    assert.deepEqual((await typesFor(personalExam)).map(t => t.id), [personalType])
    assert.equal(Number((await value('SELECT point_per_net FROM public.exams WHERE id=$1',[personalExam])).point_per_net),2)
    assert.equal((await value('SELECT question_type_id FROM public.exam_result_details WHERE id=$1',[id(61)])).question_type_id,personalType)
    const ags = (await examsFor(alice)).find(e => e.id === id(30))
    assert.equal(ags.name,'MEB-AGS'); assert.equal(ags.color,'#987654'); assert.ok(String(ags.exam_date).includes('2027'))
    assert.equal(Number(ags.wrong_penalty),4)
    assert.deepEqual((await typesFor(ags.id)).map(t => t.question_count),[15,15,6,6,30,8])
    assert.deepEqual((await typesFor(id(40))).map(t => t.name),['Kişisel AGS'])
    const ales = (await examsFor(alice)).find(e => e.id === id(50))
    assert.equal(Number(ales.wrong_penalty),5); assert.equal(Number(ales.point_per_net),2)
    assert.deepEqual((await typesFor(ales.id)).map(t => t.question_count),[50,50])
    assert.equal((await typesFor(id(90))).length,0)
    assert.equal(Number((await value('SELECT point_per_net FROM public.exams WHERE id=$1',[id(90)])).point_per_net),3.5)
    const ielts = (await examsFor(alice)).find(e => e.name === 'IELTS')
    assert.deepEqual((await typesFor(ielts.id)).map(t => [t.name,t.question_count]),[['Listening',40],['Reading',40]])
    console.log('PASS custom scoring/types, IDs, dates, colors and historical result links are preserved')

    const before = (await value('SELECT count(*)::int AS n FROM public.exam_question_types')).n
    await db.exec(migration)
    assert.equal((await value('SELECT count(*)::int AS n FROM public.exam_question_types')).n,before)
    // A user choosing to remove all copied categories must not have them restored on refresh/rerun.
    await db.query('DELETE FROM public.exam_question_types WHERE exam_id=$1',[ielts.id])
    await user(alice)
    await apply(alice)
    assert.equal((await typesFor(ielts.id)).length,0)
    await assert.rejects(apply(bob), /Access denied/)
    await assert.rejects(publish(aliceYds.id), /Admin access required/)
    await assert.rejects(db.query('SELECT public._snapshot_exam_template($1)',[aliceYds.id]), /permission denied/)
    await assert.rejects(db.query('SELECT public._apply_exam_templates($1,NULL)',[bob]), /permission denied/)
    await assert.rejects(db.query("UPDATE public.exam_templates SET point_per_net=99"), /permission denied/)
    await user(null,'anon')
    await assert.rejects(apply(alice), /permission denied/)
    await assert.rejects(db.query('SELECT * FROM public.exam_templates'), /permission denied/)
    console.log('PASS repeated application is idempotent, deliberate deletion stays deleted and non-admin/anonymous writes are denied')

    await db.exec('RESET ROLE')
    const next = id(80)
    await db.query('INSERT INTO auth.users VALUES ($1)',[next])
    await db.query("INSERT INTO public.profiles VALUES ($1,'user')",[next])
    assert.equal((await examsFor(next)).length,4)
    await user(admin)
    await assert.rejects(publish(personalExam), /own account/)
    await apply(bob)
    await db.exec('RESET ROLE')
    await db.query('UPDATE public.exams SET point_per_net=1.5 WHERE id=$1',[sourceExam])
    await user(admin)
    assert.equal((await publish(sourceExam)).accounts_checked,6)
    assert.equal(Number((await value('SELECT point_per_net FROM public.exams WHERE id=$1',[aliceYds.id])).point_per_net),1.25)
    assert.equal((await typesFor(ielts.id)).length,0)
    console.log('PASS future-profile defaults and intentional admin publishing preserve existing account customization')
  } finally { await db.close() }
}
await scenario()
await scenario('ambiguous')
await scenario('missing')
