import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const alice = '11111111-1111-4111-8111-111111111111'
const bob = '22222222-2222-4222-8222-222222222222'
const admin = '33333333-3333-4333-8333-333333333333'
const resource = '44444444-4444-4444-8444-444444444444'
const ids = [1, 2, 3, 4, 5].map(n => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`)

test('video migration enforces durable partials, permissions and immutable Monday completion in PostgreSQL', async t => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text);
      CREATE TABLE public.video_plan_items (id uuid PRIMARY KEY, user_id uuid NOT NULL, resource_id uuid NOT NULL, date date NOT NULL, video_count integer DEFAULT 1, watched_count integer DEFAULT 0, is_completed boolean DEFAULT false, sort_order integer DEFAULT 0);
      INSERT INTO public.profiles VALUES ('${alice}', 'user'), ('${bob}', 'user'), ('${admin}', 'admin');
      INSERT INTO public.video_plan_items(id,user_id,resource_id,date,video_count,watched_count)
        VALUES ('${ids[0]}','${alice}','${resource}','2026-01-06',1,0), ('${ids[1]}','${alice}','${resource}','2026-01-07',3,1), ('${ids[2]}','${bob}','${resource}','2026-01-08',1,0), ('${ids[3]}','${alice}','${resource}','2026-01-09',1,0), ('${ids[4]}','${alice}','${resource}','2026-01-10',1,0);
      ALTER TABLE public.video_plan_items ENABLE ROW LEVEL SECURITY;
      CREATE POLICY own_or_admin ON public.video_plan_items FOR ALL TO authenticated USING (user_id = auth.uid() OR EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin')) WITH CHECK (user_id = auth.uid() OR EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin'));
      GRANT SELECT ON public.profiles TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_plan_items TO authenticated;`)
    const sql = await readFile(new URL('../supabase/migrations/video_watch_parts.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const as = async uid => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid]); await db.exec('SET ROLE authenticated') }
    const row = async id => (await db.query('SELECT *, date::text AS date, completion_week::text AS completion_week, planned_date::text AS planned_date FROM public.video_plan_items WHERE id=$1', [id])).rows[0]
    const save = async (id, total, done) => db.query('SELECT * FROM public.set_video_watch_parts($1,$2,$3)', [id, total, done])
    await as(alice)
    await t.test('older progress survives migration; partial progress saves without counting a video', async () => {
      assert.equal((await row(ids[1])).watched_count, 1)
      await save(ids[0], 4, 1)
      assert.equal((await row(ids[0])).watch_parts_done, 1)
      assert.equal((await row(ids[0])).watched_count, 0)
      assert.equal((await row(ids[0])).is_completed, false)
      assert.equal((await row(ids[0])).completion_week, null)
      await as(bob); await as(alice)
      assert.equal((await row(ids[0])).watch_parts_done, 1)
    })
    await t.test('users cannot mutate another account, anonymous requests fail and multi-video rows cannot split', async () => {
      await assert.rejects(save(ids[2], 2, 1), { code: '42501' })
      await assert.rejects(save(ids[1], 2, 1), { code: '23514' })
      await assert.rejects(save(ids[0], 3, 4), { code: '23514' })
      await as(''); await assert.rejects(save(ids[0], 2, 1), { code: '42501' }); await as(alice)
    })
    await t.test('completion records exactly one video on this Monday, independent of plan date; retries do not duplicate', async () => {
      await save(ids[0], 4, 4)
      const monday = (await db.query("SELECT date_trunc('week', now() AT TIME ZONE 'Europe/Istanbul')::date::text AS day")).rows[0].day
      const completed = await row(ids[0])
      assert.equal(completed.completion_week, monday)
      assert.equal(completed.date, monday)
      assert.equal(completed.planned_date, '2026-01-06')
      assert.equal(completed.watched_count, 1)
      await save(ids[0], 4, 4)
      assert.equal((await db.query('SELECT count(*)::int AS n FROM public.video_plan_items WHERE id=$1', [ids[0]])).rows[0].n, 1)
    })
    await t.test('completed rows reject shifts, reorder, resource changes, unwatch and admin changes', async () => {
      for (const patch of ["date=date+1", "sort_order=99", "watched_count=0", "watch_parts_done=0", `user_id='${bob}'`, 'completion_week=NULL']) {
        await assert.rejects(db.query(`UPDATE public.video_plan_items SET ${patch} WHERE id=$1`, [ids[0]]), { code: '23514' })
      }
      await as(admin); await assert.rejects(save(ids[0], 4, 2), { code: '23514' }); await as(alice)
    })
    await t.test('bulk completion is atomic when any row is unauthorized or missing', async () => {
      await save(ids[3], 2, 1)
      await assert.rejects(db.query('SELECT * FROM public.complete_video_plan_items($1::uuid[])', [[ids[3], ids[2]]]), { code: '42501' })
      assert.equal((await row(ids[3])).watch_parts_done, 1)
      assert.equal((await row(ids[3])).completion_week, null)
      await db.query('SELECT * FROM public.complete_video_plan_items($1::uuid[])', [[ids[3], ids[1]]])
      assert.equal((await row(ids[3])).watched_count, 1)
      assert.equal((await row(ids[1])).watched_count, 3)
    })
    await t.test('resource reset clears unfinished parts and ordinary counts but preserves completion logs', async () => {
      await save(ids[4], 3, 1)
      await db.query('SELECT public.reset_video_watch_progress($1,$2)', [alice, resource])
      assert.equal((await row(ids[0])).watched_count, 1)
      assert.equal((await row(ids[3])).watched_count, 1)
      assert.equal((await row(ids[1])).watched_count, 0)
      assert.equal((await row(ids[4])).watch_parts_done, 0)
      await assert.rejects(db.query('SELECT public.reset_video_watch_progress($1,$2)', [bob, resource]), { code: '42501' })
      await db.query('DELETE FROM public.video_plan_items WHERE id=$1', [ids[0]])
      assert.equal(await row(ids[0]), undefined)
    })
    await t.test('admin can save a different owner’s unfinished video', async () => {
      await as(admin); await save(ids[2], 3, 1)
      assert.equal((await row(ids[2])).watch_parts_done, 1)
    })
  } finally { await db.close() }
})
