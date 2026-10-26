import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

// Run against a production build with the fixture URL/key; no live Supabase data.
const root = resolve('dist'), mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2' }
const server = http.createServer(async (req, res) => {
  let file = join(root, new URL(req.url, 'http://localhost').pathname)
  try { if (!(await stat(file)).isFile()) file = join(root, 'index.html') } catch { file = join(root, 'index.html') }
  res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const uid = '11111111-1111-4111-8111-111111111111', sid = '22222222-2222-4222-8222-222222222222', examId = '33333333-3333-4333-8333-333333333333'
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.com', created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: { display_name: 'Test' } }
const plans = [], logs = [], sessions = [], writes = [], errors = []
let failTarget = true
const target = payload => {
  let plan = plans.find(plan => payload.p_plan_id ? plan.id === payload.p_plan_id : plan.date === payload.p_date && plan.note === payload.p_note)
  if (!plan) {
    plan = { id: crypto.randomUUID(), user_id: uid, subject_id: sid, resource_id: null, video_plan_item_id: null, kind: 'extra', created_at: '2026-10-22T09:00:00Z', archived_at: null, subjects: { name: 'Sözel Yetenek', exam_id: examId }, resources: null }
    plans.push(plan)
  }
  Object.assign(plan, { date: payload.p_date, note: payload.p_note, target_questions: payload.p_target, period: payload.p_period || 'day' })
  return plan.id
}
const deadline = setTimeout(() => { console.error('Question note browser test timed out'); process.exit(1) }, 90000); deadline.unref()
let browser
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--no-zygote', '--single-process'] } : {}) })
  const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, timezoneId: 'Europe/Istanbul' })
  const page = await context.newPage(); page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.setFixedTime(new Date('2026-10-22T10:00:00Z'))
  await context.addInitScript(user => { localStorage.setItem('sb-exam-test-auth-token', JSON.stringify({ access_token: 'fixture', refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 86400, token_type: 'bearer', user })) }, user)
  await context.route('https://exam-test.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1), payload = request.postDataJSON()
    let data = []
    if (table === 'profiles') data = { id: uid, display_name: 'Test', email: user.email, role: 'user' }
    else if (table === 'user') data = user
    else if (table === 'subjects') data = [{ id: sid, name: 'Sözel Yetenek', exam_id: examId, user_id: uid, exams: { name: 'AGS' } }]
    else if (table === 'exams') data = [{ id: examId, name: 'AGS', color: '#4269a8', user_id: uid }]
    else if (table === 'pomodoro_settings') data = { long_focus_minutes: 50, long_break_minutes: 10, short_focus_minutes: 25, short_break_minutes: 5 }
    else if (table === 'question_plans') data = plans
    else if (table === 'question_session_results') data = url.searchParams.get('select')?.startsWith('note,') ? logs.map(log => ({ note: log.note, question_plans: { subject_id: sid } })) : logs
    else if (table === 'study_sessions') data = sessions
    else if (table === 'set_question_target_with_note') {
      writes.push({ table, payload })
      if (failTarget) { failTarget = false; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: '503', message: 'fixture failure' }) }); return }
      data = target(payload)
    } else if (table === 'copy_previous_question_week') {
      const sources = [{ date: '2026-10-22', note: 'Cümlede anlam', count: 30 }, { date: '2026-10-22', note: 'Önceki haftadan gelen konu', count: 20 }]
      let copied = 0, skipped = 0
      for (const source of sources) {
        if (plans.some(plan => plan.date === source.date && plan.note === source.note)) { skipped++; continue }
        target({ p_date: source.date, p_note: source.note, p_target: source.count }); copied++
      }
      data = { copied, skipped }
    } else if (table === 'save_question_week_targets_with_notes') {
      writes.push({ table, payload })
      for (const row of payload.p_targets) target({ p_date: row.date, p_note: row.note, p_plan_id: row.plan_id, p_target: row.target })
      data = { saved: payload.p_targets.length }
    } else if (table === 'add_solved_questions' || table === 'save_question_study_session') {
      writes.push({ table, payload })
      const plan = plans.find(plan => plan.id === payload.p_question_plan_id)
      if (table === 'save_question_study_session') sessions.push({ id: payload.p_session_id, user_id: uid, subject_id: sid, resource_id: null, session_type: 'manual', started_at: payload.p_started_at, ended_at: payload.p_ended_at, duration_minutes: payload.p_duration_minutes, note: null, is_edited: false })
      logs.push({ id: payload.p_entry_id || crypto.randomUUID(), question_plan_id: plan.id, session_id: payload.p_session_id || null, user_id: uid, created_at: '2026-10-22T10:02:00Z', solved_questions: payload.p_questions, correct_questions: payload.p_correct, wrong_questions: payload.p_wrong, note: plan.note || payload.p_note })
      data = null
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.goto(origin + '/questions')
  async function addGoal(note) {
    await page.getByRole('button', { name: 'Hedef ekle', exact: true }).click()
    await page.locator('#question-subject').selectOption(sid)
    await page.locator('#question-plan-note').fill(note)
    await page.locator('.swal2-input').fill('30')
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    if (plans.length === 0) {
      await page.locator('.swal2-validation-message').waitFor({ state: 'visible' })
      assert.equal(await page.locator('#question-plan-note').inputValue(), note)
      await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
    }
    await page.locator('.swal2-popup').waitFor({ state: 'hidden' })
    await page.locator('.question-day-task').filter({ hasText: note }).waitFor()
  }
  await addGoal('Sözcükte anlam'); await addGoal('Cümlede anlam')
  // Both unsolved plan topics and previously typed solution notes are selectable.
  await page.getByRole('button', { name: 'Hedef ekle', exact: true }).click()
  await page.locator('#question-subject').selectOption(sid)
  await page.locator('.question-note-history button').filter({ hasText: 'Sözcükte anlam' }).waitFor()
  await page.getByRole('button', { name: '10', exact: true }).click()
  assert.equal(await page.locator('.swal2-input').inputValue(), '10')
  await page.locator('#question-plan-note').fill('CÜMLE')
  await page.locator('.question-note-history button').filter({ hasText: 'Cümlede anlam' }).waitFor()
  assert.equal(await page.locator('.question-note-history button:visible').count(), 1)
  await page.locator('.question-note-history button').filter({ hasText: 'Cümlede anlam' }).click()
  assert.equal(await page.locator('#question-plan-note').inputValue(), 'Cümlede anlam')
  await page.getByRole('button', { name: 'İptal', exact: true }).click()
  console.log('PASS goal history suggestions, Turkish live filtering, click selection and quick 10')
  assert.equal(plans.length, 2)
  assert.notEqual(plans[0].id, plans[1].id)
  const goal = note => page.locator('.question-day-task').filter({ hasText: note })
  await goal('Sözcükte anlam').getByRole('button', { name: 'Çözülen ekle', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('#question-note')?.value === 'Sözcükte anlam')
  assert.equal(await page.locator('#question-note').inputValue(), 'Sözcükte anlam')
  assert.equal(await page.locator('#question-note').getAttribute('readonly'), '')
  assert.equal(await page.locator('.question-note-history button').count(), 0)
  await page.locator('.swal2-input').fill('12')
  await page.getByRole('button', { name: 'Ekle', exact: true }).click()
  await page.locator('.swal2-popup').waitFor({ state: 'hidden' })
  await goal('Sözcükte anlam').getByText('12 çözüldü', { exact: true }).waitFor()
  assert.match(await goal('Cümlede anlam').innerText(), /0 çözüldü/)
  await goal('Sözcükte anlam').getByRole('button', { name: 'Hedefi düzenle', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('#question-plan-note')?.readOnly === true)
  assert.equal(await page.locator('#question-plan-note').getAttribute('readonly'), '')
  await page.getByRole('button', { name: 'İptal', exact: true }).click()
  await page.locator('.app-sidebar a[href="/history"]').click()
  await page.getByText('Sözcükte anlam', { exact: true }).waitFor()
  await page.getByText('12 soru', { exact: true }).waitFor()
  assert.equal(await page.getByText('12 soru', { exact: true }).count(), 1)
  console.log('PASS create/retry, separate topics, fixed manual note, immutable plan topic and history')
  target({ p_date: '2026-10-15', p_note: 'Önceki haftanın günlük soruları', p_target: 30 })
  target({ p_date: '2026-10-12', p_note: 'Önceki haftanın haftalık soruları', p_target: 50, p_period: 'week' })
  await page.goto(origin + '/study')
  const previousToggle = page.getByRole('button', { name: /Önceki haftalardan kalanlar/ })
  await previousToggle.waitFor()
  assert.equal(await previousToggle.getAttribute('aria-expanded'), 'false')
  const oldDay = page.locator('.study-task-row').filter({ hasText: 'Önceki haftanın günlük soruları' })
  const oldWeek = page.locator('.study-task-row').filter({ hasText: 'Önceki haftanın haftalık soruları' })
  assert.equal(await oldDay.isVisible(), false)
  assert.equal(await oldWeek.isVisible(), false)
  await previousToggle.click()
  await oldDay.waitFor({ state: 'visible' }); await oldWeek.waitFor({ state: 'visible' })
  assert.equal(await previousToggle.getAttribute('aria-expanded'), 'true')
  await previousToggle.click()
  await oldDay.waitFor({ state: 'hidden' })
  await page.reload()
  await previousToggle.waitFor()
  assert.equal(await previousToggle.getAttribute('aria-expanded'), 'false')
  assert.equal(await oldWeek.isVisible(), false)
  console.log('PASS previous-week daily/weekly leftovers hidden by default, explicit toggle and closed after reload')

  await page.locator('.study-task-row').filter({ hasText: 'Cümlede anlam' }).click()
  await page.getByRole('button', { name: 'Bitir ve kaydet', exact: true }).waitFor()
  await page.clock.setFixedTime(new Date('2026-10-22T10:01:10Z'))
  await page.reload()
  await page.getByRole('heading', { name: 'Bu süre içinde çalıştınız mı?', exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('#question-note')?.value === 'Cümlede anlam')
  assert.equal(await page.locator('#question-note').inputValue(), 'Cümlede anlam')
  assert.equal(await page.locator('#question-note').getAttribute('readonly'), '')
  await page.locator('.swal2-input').fill('7')
  await page.getByRole('button', { name: 'Kaydet ve bitir', exact: true }).click()
  await page.locator('.swal2-popup').waitFor({ state: 'hidden' })
  const saved = writes.find(write => write.table === 'save_question_study_session').payload
  assert.equal(saved.p_question_plan_id, plans[1].id)
  assert.equal(saved.p_note, 'Cümlede anlam')
  await page.locator('.app-sidebar a[href="/history"]').click()
  await page.getByText('Cümlede anlam', { exact: true }).waitFor()
  await page.getByText('7 soru', { exact: true }).waitFor()
  assert.equal(await page.getByText('7 soru', { exact: true }).count(), 1)
  console.log('PASS selected topic survives timer reload and appears once in history')
  // A note originally typed during a free solution also becomes a target suggestion.
  const freePlan = { ...plans[0], id: crypto.randomUUID(), note: null, target_questions: null }
  plans.push(freePlan)
  logs.push({ id: crypto.randomUUID(), question_plan_id: freePlan.id, user_id: uid, session_id: null, created_at: '2026-10-22T11:00:00Z', solved_questions: 2, note: 'Çözüm notundan gelen konu' })
  await page.locator('.app-sidebar a[href="/questions"]').click()
  await page.getByRole('button', { name: 'Hedef ekle', exact: true }).click()
  await page.locator('#question-subject').selectOption(sid)
  await page.locator('#question-plan-note').fill('çözüm notundan')
  await page.locator('.question-note-history button').filter({ hasText: 'Çözüm notundan gelen konu' }).waitFor()
  await page.getByRole('button', { name: 'İptal', exact: true }).click()
  await page.getByRole('button', { name: 'Haftayı planla', exact: true }).click()
  await page.getByRole('textbox', { name: 'Pazartesi soru hedefi', exact: true }).fill('45')
  await page.getByLabel('Pazartesi konu / not', { exact: true }).fill('Paragraf')
  await page.getByRole('button', { name: 'Günlere kaydet', exact: true }).click()
  await page.getByText('Hedefler günlere eklendi. Planım sekmesinde görebilirsin.', { exact: true }).waitFor()
  assert.equal(writes.find(write => write.table === 'save_question_week_targets_with_notes').payload.p_targets.find(row => row.date === '2026-10-19').note, 'Paragraf')
  const countsBeforeCopy = [logs.length, sessions.length]
  await page.getByRole('button', { name: 'Önceki haftayı kopyala', exact: true }).click()
  await page.getByRole('button', { name: 'Hedefleri kopyala', exact: true }).click()
  await page.getByRole('heading', { name: '1 hedef kopyalandı', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Tamam', exact: true }).click()
  await page.locator('.question-day-task').filter({ hasText: 'Önceki haftadan gelen konu' }).waitFor()
  assert.deepEqual([logs.length, sessions.length], countsBeforeCopy)
  const plansAfterCopy = plans.length
  await page.getByRole('button', { name: 'Önceki haftayı kopyala', exact: true }).click()
  await page.getByRole('button', { name: 'Hedefleri kopyala', exact: true }).click()
  await page.getByRole('heading', { name: 'Yeni hedef eklenmedi', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Tamam', exact: true }).click()
  assert.equal(plans.length, plansAfterCopy)
  console.log('PASS previous-week copy, existing targets preserved and no duplicated goals or history')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
  await page.screenshot({ path: '/tmp/question-plan-notes-mobile.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log('PASS weekly note saving and compact mobile layout')
} finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); clearTimeout(deadline) }
