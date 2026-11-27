import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const admin = id(1), alice = id(2), bob = id(3), subject = id(4)

test('DEHB modu: yalnızca admin plan yazar, 1 dakika çalışılan ders yapıldı sayılır ve tekrar gönderim iki kez sayılmaz', async () => {
  const db = new PGlite()
  const as = async uid => {
    await db.exec('RESET ROLE')
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid || ''])
    await db.exec(`SET ROLE ${uid ? 'authenticated' : 'anon'}`)
  }
  const record = (task, session, start, end) => db.query('SELECT (public.record_adhd_task_study($1,$2,$3,$4)).*', [task, session, start, end]).then(r => r.rows[0])
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated;
      CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text);
      CREATE TABLE public.subjects(id uuid PRIMARY KEY, user_id uuid, name text);
      CREATE TABLE public.topics(id uuid PRIMARY KEY, user_id uuid, subject_id uuid, title text, is_completed boolean NOT NULL DEFAULT false);
      CREATE TABLE public.ags_shared_subjects(id uuid PRIMARY KEY, name text, sort_order int NOT NULL DEFAULT 0);
      CREATE TABLE public.ags_shared_topics(id uuid PRIMARY KEY, subject_id uuid, title text, sort_order int NOT NULL DEFAULT 0, archived_at timestamptz);
      CREATE TABLE public.ags_topic_progress(user_id uuid, topic_id uuid, is_completed boolean NOT NULL DEFAULT false, updated_at timestamptz, PRIMARY KEY (user_id, topic_id));
      CREATE TABLE public.study_sessions(id uuid PRIMARY KEY, user_id uuid, subject_id uuid NOT NULL, resource_id uuid, session_type text, started_at timestamptz, ended_at timestamptz, duration_minutes numeric(12,6));
      GRANT SELECT ON public.profiles, public.subjects, public.study_sessions TO authenticated;
      GRANT SELECT, INSERT ON public.topics, public.ags_topic_progress TO authenticated;
      INSERT INTO auth.users VALUES ('${admin}'), ('${alice}'), ('${bob}');
      INSERT INTO public.profiles VALUES ('${admin}','admin'), ('${alice}','user'), ('${bob}','user');
      INSERT INTO public.subjects VALUES ('${subject}','${alice}','Tarih');`)
    const sql = await readFile(new URL('../supabase/migrations/adhd_mode.sql', import.meta.url), 'utf8')
    await db.exec(sql); await db.exec(sql)
    const sets = await readFile(new URL('../supabase/migrations/adhd_plan_sets.sql', import.meta.url), 'utf8')
    await db.exec(sets); await db.exec(sets)
    const topicsSql = await readFile(new URL('../supabase/migrations/adhd_topics.sql', import.meta.url), 'utf8')
    await db.exec(topicsSql); await db.exec(topicsSql)
    const extrasSql = await readFile(new URL('../supabase/migrations/adhd_extras.sql', import.meta.url), 'utf8')
    await db.exec(extrasSql); await db.exec(extrasSql)
    const questionsSql = await readFile(new URL('../supabase/migrations/adhd_autoplan.sql', import.meta.url), 'utf8')
    await db.exec(questionsSql); await db.exec(questionsSql)

    await as(alice)
    await assert.rejects(db.query(`INSERT INTO public.adhd_mode_settings VALUES ('${alice}', true)`), /row-level security/)
    await assert.rejects(db.query(`INSERT INTO public.adhd_daily_tasks(user_id,task_date,subject_id) VALUES ('${alice}','2026-11-24','${subject}')`), /row-level security/)

    await as(admin)
    await db.query(`INSERT INTO public.adhd_mode_settings(user_id, enabled) VALUES ('${alice}', true)`)
    const { rows: [task] } = await db.query(`INSERT INTO public.adhd_daily_tasks(user_id,task_date,subject_id,note) VALUES ('${alice}','2026-11-24','${subject}','20 soru') RETURNING id`)

    await as(bob)
    assert.equal((await db.query('SELECT * FROM public.adhd_daily_tasks')).rows.length, 0)
    assert.equal((await db.query('SELECT * FROM public.adhd_mode_settings')).rows.length, 0)
    await assert.rejects(record(task.id, id(20), '2026-11-24T10:00:00Z', '2026-11-24T10:05:00Z'), /Task not found/)

    await as(alice)
    assert.equal((await db.query('SELECT enabled FROM public.adhd_mode_settings')).rows[0].enabled, true)
    const short = await record(task.id, id(21), '2026-11-24T10:00:00Z', '2026-11-24T10:00:40Z')
    assert.equal(short.studied_seconds, 40); assert.equal(short.completed_at, null)
    const done = await record(task.id, id(22), '2026-11-24T11:00:00Z', '2026-11-24T11:01:00Z')
    assert.equal(done.studied_seconds, 100); assert.notEqual(done.completed_at, null)
    const again = await record(task.id, id(22), '2026-11-24T11:00:00Z', '2026-11-24T11:01:00Z')
    assert.equal(again.studied_seconds, 100)
    await assert.rejects(record(task.id, id(23), '2026-11-24T11:00:00Z', '2026-11-24T10:00:00Z'), /Invalid session time/)
    const sessions = (await db.query('SELECT user_id, subject_id, duration_minutes::float AS m FROM public.study_sessions')).rows
    assert.deepEqual(sessions, [{ user_id: alice, subject_id: subject, m: 1 }])
    await assert.rejects(db.query(`UPDATE public.adhd_daily_tasks SET completed_at = now()`).then(r => { if (r.affectedRows === 0) throw new Error('row-level security') }), /row-level security/)

    // Setler: yalnızca admin, yalnızca kendi setleri
    await assert.rejects(db.query(`INSERT INTO public.adhd_plan_sets(name, items) VALUES ('Benim', '[]')`), /row-level security/)
    await as(admin)
    await db.query(`INSERT INTO public.adhd_plan_sets(name, items) VALUES ('Normal hafta', '[{"day":1,"subject_name":"Tarih","note":null}]')`)
    await assert.rejects(db.query(`INSERT INTO public.adhd_plan_sets(name, items) VALUES ('   ', '[]')`), /check constraint/)
    await assert.rejects(db.query(`INSERT INTO public.adhd_plan_sets(owner_id, name) VALUES ('${alice}', 'Sahte')`), /row-level security/)
    assert.equal((await db.query('SELECT owner_id FROM public.adhd_plan_sets')).rows[0].owner_id, admin)
    await as(alice)
    assert.equal((await db.query('SELECT * FROM public.adhd_plan_sets')).rows.length, 0)

    // Konular: kişi kendi dersinin konusunu bitirir; gerçek konu listesi de güncellenir.
    await as(admin)
    await db.exec(`INSERT INTO public.topics VALUES ('${id(30)}', '${alice}', '${subject}', 'Osmanlı Kuruluş', false)`)
    await assert.rejects(db.query(`INSERT INTO public.adhd_daily_tasks(user_id,task_date,subject_id,topic_kind,topic_id) VALUES ('${alice}','2026-11-25','${subject}','personal','${id(30)}')`), /adhd_daily_tasks_topic_check/)
    const { rows: [t1] } = await db.query(`INSERT INTO public.adhd_daily_tasks(user_id,task_date,subject_id,topic_kind,topic_id,topic_title) VALUES ('${alice}','2026-11-25','${subject}','personal','${id(30)}','Osmanlı Kuruluş') RETURNING id`)
    const { rows: [t2] } = await db.query(`INSERT INTO public.adhd_daily_tasks(user_id,task_date,subject_id,topic_kind,topic_id,topic_title) VALUES ('${alice}','2026-11-26','${subject}','personal','${id(30)}','Osmanlı Kuruluş') RETURNING id`)
    const { rows: [t3] } = await db.query(`INSERT INTO public.adhd_daily_tasks(user_id,task_date,subject_id,topic_kind,topic_id,topic_title) VALUES ('${alice}','2026-11-27','${subject}','shared','${id(31)}','Ortak konu') RETURNING id`)
    const topicDone = (taskId, done) => db.query('SELECT (public.set_adhd_task_topic_done($1,$2)).*', [taskId, done]).then(r => r.rows[0])
    await as(bob)
    await assert.rejects(topicDone(t1.id, true), /Task not found/)
    await assert.rejects(topicDone(task.id, true), /Task not found|Task has no topic/)
    await as(alice)
    await assert.rejects(topicDone(task.id, true), /Task has no topic/)
    assert.notEqual((await topicDone(t1.id, true)).topic_completed_at, null)
    await as(admin)
    assert.equal((await db.query(`SELECT is_completed FROM public.topics WHERE id='${id(30)}'`)).rows[0].is_completed, true)
    assert.notEqual((await db.query(`SELECT topic_completed_at FROM public.adhd_daily_tasks WHERE id='${t2.id}'`)).rows[0].topic_completed_at, null, 'same topic on other days follows')
    await as(alice)
    await topicDone(t3.id, true)
    await as(admin)
    assert.equal((await db.query(`SELECT is_completed FROM public.ags_topic_progress WHERE user_id='${alice}' AND topic_id='${id(31)}'`)).rows[0].is_completed, true)
    await topicDone(t1.id, false)
    assert.equal((await db.query(`SELECT is_completed FROM public.topics WHERE id='${id(30)}'`)).rows[0].is_completed, false)
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.adhd_daily_tasks WHERE topic_completed_at IS NOT NULL AND topic_kind='personal'`)).rows[0].n, 0)

    // Ekstra çalışma: kişi kendi dersine ekler, sıradaki ortak konu atanır.
    await db.exec(`RESET ROLE;
      INSERT INTO public.subjects VALUES ('${id(6)}','${bob}','Tarih');
      INSERT INTO public.ags_shared_subjects VALUES ('${id(40)}','Tarih',0), ('${id(44)}','Sözel Yetenek',1);
      INSERT INTO public.ags_shared_topics VALUES ('${id(41)}','${id(40)}','Kuruluş',0,NULL), ('${id(42)}','${id(40)}','Yükselme',1,NULL),
        ('${id(43)}','${id(40)}','Arşivlenmiş',2,now()), ('${id(45)}','${id(44)}','Paragraf',0,NULL);
      INSERT INTO public.ags_topic_progress VALUES ('${alice}','${id(41)}',true,now());`)
    const localToday = (await db.query("SELECT ((now() AT TIME ZONE 'Europe/Istanbul')::date)::text AS d")).rows[0].d
    const extra = (subjectId, day = localToday) => db.query('SELECT * FROM public.add_adhd_extra_task($1,$2::date)', [subjectId, day]).then(r => r.rows[0])
    await as(alice)
    const e1 = await extra(subject)
    assert.equal(e1.is_extra, true); assert.equal(e1.topic_id, id(42)); assert.equal(e1.topic_title, 'Yükselme')
    const e2 = await extra(subject)
    assert.equal(e2.topic_id, null, 'planned topics are not handed out twice; archived topics are skipped')
    await assert.rejects(extra(subject, '2020-01-01'), /Invalid day/)
    await assert.rejects(extra(id(6)), /Subject not found/)
    await assert.rejects(db.query(`UPDATE public.adhd_daily_tasks SET is_extra = false WHERE id = '${e1.id}'`).then(r => { if (!r.affectedRows) throw new Error('row-level security') }), /row-level security/)
    await as(bob)
    await assert.rejects(extra(id(6)), /ADHD mode is off/)

    // "Başka bir konu çalıştım": yalnızca aynı dersin, arşivlenmemiş ortak konusu seçilebilir.
    const change = (taskId, topicId) => db.query('SELECT * FROM public.change_adhd_task_topic($1,$2)', [taskId, topicId]).then(r => r.rows[0])
    await assert.rejects(change(e1.id, id(41)), /Task not found/)
    await as(alice)
    const changed = await change(e1.id, id(41))
    assert.equal(changed.topic_title, 'Kuruluş'); assert.notEqual(changed.topic_completed_at, null, 'already finished topic shows as done')
    await assert.rejects(change(e1.id, id(43)), /Topic not found/)
    await assert.rejects(change(e1.id, id(45)), /another subject/)
    const back = await change(e1.id, id(42))
    assert.equal(back.topic_completed_at, null)

    // Soru çözümü: derse bağlı olmayan madde adıyla eklenir; süresi tutulur ama çalışma geçmişine oturum yazılmaz.
    await as(alice)
    await assert.rejects(db.query(`INSERT INTO public.adhd_question_items(label, days) VALUES ('YDS', '{1}')`), /row-level security/)
    await as(admin)
    await db.query(`INSERT INTO public.adhd_question_items(label, days) VALUES ('YDS', '{1,3}')`)
    await assert.rejects(db.query(`INSERT INTO public.adhd_question_items(label, days) VALUES ('YDS', '{8}')`), /check constraint/)
    await assert.rejects(db.query(`INSERT INTO public.adhd_daily_tasks(user_id,task_date) VALUES ('${alice}','2026-11-24')`), /adhd_daily_tasks_title_check/)
    const { rows: [q] } = await db.query(`INSERT INTO public.adhd_daily_tasks(user_id,task_date,title,note,is_questions) VALUES ('${alice}','2026-11-24','Sözel Yetenek Deneme','Soru çözümü',true) RETURNING id`)
    await as(alice)
    assert.equal((await db.query('SELECT * FROM public.adhd_question_items')).rows.length, 0)
    const before = (await db.query('SELECT count(*)::int AS n FROM public.study_sessions')).rows[0].n
    const qDone = await record(q.id, id(60), '2026-11-24T12:00:00Z', '2026-11-24T12:30:00Z')
    assert.equal(qDone.studied_seconds, 1800); assert.notEqual(qDone.completed_at, null)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.study_sessions')).rows[0].n, before)

    // Konular kendiliğinden ilerler (tarihten bağımsız olsun diye Bob'un dersleriyle).
    await db.exec('RESET ROLE')
    await db.query(`INSERT INTO public.ags_shared_topics VALUES ('${id(46)}','${id(40)}','Gerileme',3,NULL), ('${id(47)}','${id(40)}','Dağılma',4,NULL)`)
    const bobTask = async (key, offset, extraCols = '', extraVals = '') => (await db.query(
      `INSERT INTO public.adhd_daily_tasks(user_id,task_date,subject_id,sort_order${extraCols}) VALUES ($1, $2::date + $3::int, $4, $5${extraVals}) RETURNING id`,
      [bob, localToday, offset, id(6), key])).rows[0].id
    const b0 = await bobTask(0, 0, ',studied_seconds,completed_at,topic_kind,topic_id,topic_title', `,120,now(),'shared','${id(42)}','Yükselme'`)
    const b1 = await bobTask(1, 0), b2 = await bobTask(0, 1), b3 = await bobTask(0, 2, ',topic_kind,topic_id,topic_title', `,'shared','${id(47)}','Dağılma'`)
    const bx = await bobTask(1, 1, ',is_extra,topic_kind,topic_id,topic_title', `,true,'shared','${id(46)}','Gerileme'`)
    await db.query(`INSERT INTO public.adhd_daily_tasks(user_id,task_date,title,is_questions) VALUES ($1, $2::date + 1, 'YDS', true)`, [bob, localToday])
    const topicsOf = async () => Object.fromEntries((await db.query(`SELECT id, topic_id FROM public.adhd_daily_tasks WHERE user_id = $1`, [bob])).rows.map(row => [row.id, row.topic_id]))
    const advance = uid => db.query('SELECT public.advance_adhd_topics($1) AS n', [uid]).then(r => r.rows[0].n)
    await as(alice)
    await assert.rejects(advance(bob), /Access denied/)
    await as(admin)
    assert.equal(await advance(bob), 3)
    let now = await topicsOf()
    assert.deepEqual([now[b0], now[b1], now[b2], now[b3], now[bx]], [id(42), id(41), id(42), id(46), id(46)], 'started/extra tasks keep topics; open ones get topics in order')
    await db.exec(`RESET ROLE; INSERT INTO public.ags_topic_progress VALUES ('${bob}','${id(41)}',true,now())`)
    await as(bob)
    assert.equal(await advance(bob), 3)
    now = await topicsOf()
    assert.deepEqual([now[b1], now[b2], now[b3]], [id(42), id(46), id(47)], 'finished topic moves the plan forward')
    assert.equal(await advance(bob), 0, 'idempotent')

    // Yarının dersini bugüne al.
    const pull = (taskId, day = localToday) => db.query('SELECT * FROM public.pull_adhd_task_forward($1,$2::date)', [taskId, day]).then(r => r.rows[0])
    const pulled = await pull(b2)
    assert.equal(pulled.is_extra, true); assert.equal(pulled.topic_id, id(46))
    await assert.rejects(pull(b0), /cannot be moved/)
    await as(alice)
    await assert.rejects(pull(b3), /Task not found/)

    await as(null)
    await assert.rejects(extra(subject), /permission denied/)
    await assert.rejects(record(task.id, id(24), '2026-11-24T10:00:00Z', '2026-11-24T10:05:00Z'), /permission denied/)
  } finally { await db.close() }
})
