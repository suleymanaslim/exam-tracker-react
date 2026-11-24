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
      CREATE TABLE public.study_sessions(id uuid PRIMARY KEY, user_id uuid, subject_id uuid NOT NULL, resource_id uuid, session_type text, started_at timestamptz, ended_at timestamptz, duration_minutes numeric(12,6));
      GRANT SELECT ON public.profiles, public.subjects, public.study_sessions TO authenticated;
      INSERT INTO auth.users VALUES ('${admin}'), ('${alice}'), ('${bob}');
      INSERT INTO public.profiles VALUES ('${admin}','admin'), ('${alice}','user'), ('${bob}','user');
      INSERT INTO public.subjects VALUES ('${subject}','${alice}','Tarih');`)
    const sql = await readFile(new URL('../supabase/migrations/adhd_mode.sql', import.meta.url), 'utf8')
    await db.exec(sql); await db.exec(sql)
    const sets = await readFile(new URL('../supabase/migrations/adhd_plan_sets.sql', import.meta.url), 'utf8')
    await db.exec(sets); await db.exec(sets)

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

    await as(null)
    await assert.rejects(record(task.id, id(24), '2026-11-24T10:00:00Z', '2026-11-24T10:05:00Z'), /permission denied/)
  } finally { await db.close() }
})
