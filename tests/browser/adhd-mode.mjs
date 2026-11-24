import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

// Production build with fixture credentials only; never touches a real account.
const root = resolve('dist'), mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.png': 'image/png' }
const server = http.createServer(async (req, res) => {
  let file = join(root, new URL(req.url, 'http://localhost').pathname)
  try { if (!(await stat(file)).isFile()) file = join(root, 'index.html') } catch { file = join(root, 'index.html') }
  res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const uid = '11111111-1111-4111-8111-111111111111', adminId = '99999999-9999-4999-8999-999999999999'
const subjects = [
  { id: '22222222-2222-4222-8222-000000000001', name: 'Tarih', exams: { name: 'AGS' } },
  { id: '22222222-2222-4222-8222-000000000002', name: 'Sözel Yetenek', exams: { name: 'AGS' } },
]
const account = (id, name) => ({ id, aud: 'authenticated', role: 'authenticated', email: `${name}@example.com`, created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: { display_name: name } })
const today = '2026-11-24'
const shots = process.env.ADHD_SCREENSHOTS
let enabled = true
let tasks = [
  { id: 't1', user_id: uid, task_date: today, subject_id: subjects[0].id, note: 'Osmanlı kuruluş · 20 soru', sort_order: 0, studied_seconds: 0, completed_at: null, subjects: { name: 'Tarih' } },
  { id: 't2', user_id: uid, task_date: today, subject_id: subjects[1].id, note: null, sort_order: 1, studied_seconds: 0, completed_at: null, subjects: { name: 'Sözel Yetenek' } },
]
const rpcCalls = [], inserts = [], errors = []
const deadline = setTimeout(() => { console.error('ADHD browser test timed out'); process.exit(1) }, 90000); deadline.unref()
let browser
try {
  const launch = () => chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--no-zygote', '--single-process'] } : {}) })
  const open = async (who, viewport) => {
    await browser?.close(); browser = await launch()
    const context = await browser.newContext({ viewport, timezoneId: 'Europe/Istanbul', deviceScaleFactor: shots ? 2 : 1 })
    await context.clock.install({ time: new Date('2026-11-24T10:00:00+03:00') })
    const session = { access_token: 'fixture', refresh_token: 'refresh', expires_at: Math.floor(new Date('2026-11-25').getTime() / 1000), token_type: 'bearer', user: who }
    await context.addInitScript(session => { if (!localStorage.getItem('sb-exam-test-auth-token')) localStorage.setItem('sb-exam-test-auth-token', JSON.stringify(session)) }, session)
    await context.route('https://exam-test.supabase.co/**', async route => {
      const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1)
      const isAdmin = who.id === adminId
      let data = []
      if (table === 'profiles') data = url.searchParams.get('id') ? { id: who.id, role: isAdmin ? 'admin' : 'user', display_name: who.user_metadata.display_name, email: who.email } : [{ id: adminId, role: 'admin', display_name: 'Admin', email: 'admin@example.com' }, { id: uid, role: 'user', display_name: 'Ayşe', email: 'ayse@example.com' }]
      else if (table === 'adhd_mode_settings') {
        if (request.method() === 'POST') { enabled = request.postDataJSON().enabled; data = [] }
        else data = url.searchParams.get('user_id') ? (who.id === uid ? { enabled } : null) : [{ user_id: uid, enabled }]
      } else if (table === 'adhd_daily_tasks') {
        if (request.method() === 'POST') {
          const row = request.postDataJSON(); inserts.push(row)
          tasks.push({ id: `t${tasks.length + 1}`, studied_seconds: 0, completed_at: null, ...row, subjects: { name: subjects.find(s => s.id === row.subject_id).name } })
        } else data = tasks.filter(task => task.task_date === url.searchParams.get('task_date')?.replace('eq.', ''))
      } else if (table === 'record_adhd_task_study') {
        const body = request.postDataJSON(); rpcCalls.push(body)
        const task = tasks.find(t => t.id === body.p_task_id)
        task.studied_seconds += Math.floor((Date.parse(body.p_ended_at) - Date.parse(body.p_started_at)) / 1000)
        if (task.studied_seconds >= 60) task.completed_at ??= body.p_ended_at
        data = task
      } else if (table === 'subjects') data = subjects
      else if (table === 'dashboard_community_preferences') data = []
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })
    const page = await context.newPage(); page.setDefaultTimeout(10000)
    page.on('pageerror', error => errors.push(error.message))
    return { context, page }
  }

  // Kullanıcı: yalnızca bugünün dersleri görünür, menü yoktur.
  const { context, page } = await open(account(uid, 'Ayşe'), { width: 390, height: 844 })
  await page.goto(origin + '/stats')
  await page.getByRole('heading', { name: 'Bugün yapacakların' }).waitFor()
  assert.equal(await page.locator('.app-sidebar, .app-mobile-nav').count(), 0, 'normal navigation is hidden')
  assert.equal(await page.getByText('Pomodoro').count(), 0)
  await page.getByText('0 / 2 ders yapıldı').waitFor()
  if (shots) await page.screenshot({ path: `${shots}/adhd-today.png`, fullPage: true })

  await page.getByRole('button', { name: 'Başla', exact: true }).click()
  await page.getByRole('heading', { name: 'Tarih' }).waitFor()
  await page.clock.fastForward(30_000)
  await page.getByRole('button', { name: 'Bitir' }).click()
  await page.getByText('Henüz 1 dakika olmadı.').waitFor()
  assert.equal(rpcCalls.length, 0, 'under one minute nothing is saved without asking')
  await page.getByRole('button', { name: 'Devam et' }).click()
  await page.clock.fastForward(40_000)
  await page.getByText('Bu ders yapıldı sayılacak').waitFor()
  if (shots) await page.screenshot({ path: `${shots}/adhd-focus.png` })
  // Yenileme kronometreyi sıfırlamaz.
  await page.reload()
  await page.getByRole('heading', { name: 'Tarih' }).waitFor()
  await page.getByRole('button', { name: 'Bitir' }).click()
  await page.getByText('1 / 2 ders yapıldı').waitFor()
  await page.getByText('Harika!').waitFor()
  assert.equal(rpcCalls.length, 1)
  assert.ok(Date.parse(rpcCalls[0].p_ended_at) - Date.parse(rpcCalls[0].p_started_at) >= 60_000)
  if (shots) await page.screenshot({ path: `${shots}/adhd-after.png`, fullPage: true })

  // Admin: DEHB modunu yönetir ve günlük ders ekler; kendisi tam paneli görür.
  const adminView = await open(account(adminId, 'Admin'), { width: 1280, height: 900 })
  await adminView.page.goto(origin + '/admin')
  await adminView.page.getByRole('button', { name: 'Ayşe için DEHB modu ve günlük plan' }).click()
  const dialog = adminView.page.getByRole('dialog', { name: 'DEHB modu' })
  await dialog.getByText('Osmanlı kuruluş · 20 soru').waitFor()
  await dialog.getByLabel('Ders').selectOption(subjects[1].id)
  await dialog.getByLabel('Not').fill('Paragraf 15 soru')
  await dialog.getByRole('button', { name: 'Ekle' }).click()
  await dialog.getByText('Paragraf 15 soru').waitFor()
  assert.deepEqual(inserts.map(row => [row.user_id, row.task_date, row.subject_id, row.note, row.sort_order]), [[uid, today, subjects[1].id, 'Paragraf 15 soru', 2]])
  if (shots) await adminView.page.screenshot({ path: `${shots}/adhd-admin.png` })
  await dialog.getByRole('switch').click()
  await dialog.getByText('DEHB modu kapalı').waitFor()
  assert.equal(enabled, false)
  assert.ok(await adminView.page.locator('.app-sidebar').count() > 0, 'admin keeps the full layout')
  assert.deepEqual(errors, [])
  console.log('PASS today-only view, stopwatch with 1-minute completion, reload recovery, admin daily plan and toggle')
} finally { clearTimeout(deadline); await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
