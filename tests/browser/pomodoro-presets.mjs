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
const uid = '11111111-1111-4111-8111-111111111111', sid = '22222222-2222-4222-8222-222222222222', examId = '33333333-3333-4333-8333-333333333333'
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.com', created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: { display_name: 'Test', unrelated_setting: 'preserve' } }
let failNext = true
const writes = [], errors = []
const deadline = setTimeout(() => { console.error('Pomodoro preset browser test timed out'); process.exit(1) }, 90000); deadline.unref()
let browser
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--no-zygote', '--single-process'] } : {}) })
  const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, timezoneId: 'Europe/Istanbul' })
  const page = await context.newPage(); page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  await context.addInitScript(user => {
    if (!localStorage.getItem('sb-exam-test-auth-token')) localStorage.setItem('sb-exam-test-auth-token', JSON.stringify({ access_token: 'fixture', refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 86400, token_type: 'bearer', user }))
  }, user)
  await context.route('https://exam-test.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1)
    let data = []
    if (table === 'user') {
      if (request.method() === 'PUT') {
        writes.push(request.postDataJSON())
        if (failNext) { failNext = false; await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'fixture failure' }) }); return }
        user.user_metadata = { ...user.user_metadata, ...request.postDataJSON().data }
      }
      data = user
    } else if (table === 'profiles') data = { id: uid, display_name: 'Test', email: user.email, role: 'user' }
    else if (table === 'subjects') data = [{ id: sid, name: 'Sözel Yetenek', exam_id: examId, user_id: uid, exams: { name: 'AGS' } }]
    else if (table === 'exams') data = [{ id: examId, name: 'AGS', color: '#4269a8', user_id: uid }]
    else if (table === 'pomodoro_settings') data = { id: 'settings', long_focus_minutes: 50, long_break_minutes: 10, short_focus_minutes: 25, short_break_minutes: 5 }
    else if (table === 'get_dashboard_community') data = { show_widget: false, share_statistics: false, entries: [], daily_message: '' }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  const go = async path => { await page.locator(`.app-sidebar a[href="${path}"]`).click(); await page.waitForURL(origin + path) }
  await page.goto(origin + '/settings?tab=pomodoro')
  const panel = page.getByRole('region', { name: 'Hazır sayaçlarım' })
  await panel.getByLabel('Sayaç adı').fill('Derin çalışma')
  await panel.getByLabel('Odak (dk)', { exact: true }).fill('60')
  await panel.getByLabel('Mola (dk)', { exact: true }).fill('12')
  await panel.getByRole('button', { name: 'Sayaç ekle', exact: true }).click()
  await panel.getByRole('alert').waitFor()
  assert.equal(await panel.getByLabel('Sayaç adı').inputValue(), 'Derin çalışma', 'failed save keeps the draft')
  assert.equal(user.user_metadata.pomodoro_preferences, undefined)
  await panel.getByRole('button', { name: 'Sayaç ekle', exact: true }).click()
  await panel.getByRole('button', { name: 'Derin çalışma sayacını düzenle' }).waitFor()
  const id = user.user_metadata.pomodoro_preferences.presets[0].id
  assert.equal(user.user_metadata.display_name, 'Test')
  assert.equal(user.user_metadata.unrelated_setting, 'preserve')
  await go('/study')
  const picker = page.getByLabel('Hazır Pomodoro sayacı')
  await picker.waitFor(); await page.waitForFunction(() => !document.querySelector('[aria-label="Hazır Pomodoro sayacı"]').disabled)
  failNext = true
  await picker.selectOption(id)
  await page.getByRole('alert').waitFor()
  assert.equal(await picker.inputValue(), 'long', 'failed selection keeps the previous choice')
  await picker.selectOption(id)
  await page.waitForFunction(id => document.querySelector('[aria-label="Hazır Pomodoro sayacı"]').value === id, id)
  await page.waitForFunction(() => document.querySelector('[role="timer"]').textContent.replace(/\s/g,'') === '01:00:00')
  await page.reload(); await picker.waitFor()
  assert.equal(await picker.inputValue(), id, 'choice persists through reload')
  await page.getByRole('button', { name: 'Serbest çalışma', exact: true }).click()
  await page.getByLabel('Sınav', { exact: true }).selectOption(examId)
  await page.getByLabel('Ders', { exact: true }).selectOption(sid)
  await page.getByRole('button', { name: 'Başlat', exact: true }).click()
  await page.getByRole('button', { name: 'Duraklat', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Duraklat', exact: true }).click()
  const snapshot = await page.evaluate(uid => JSON.parse(localStorage.getItem(`examtracker-timer-v1:${uid}`)), uid)
  assert.equal(snapshot.focusSeconds, 3600)
  assert.equal(snapshot.breakSeconds, 720)
  await go('/settings')
  await page.getByRole('button', { name: 'Pomodoro', exact: true }).click()
  await panel.getByRole('button', { name: 'Derin çalışma sayacını düzenle' }).click()
  await panel.getByLabel('Odak (dk)', { exact: true }).fill('90')
  await panel.getByLabel('Mola (dk)', { exact: true }).fill('0')
  await panel.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click()
  await panel.getByText('90 dk odak · 0 dk mola · Seçili', { exact: true }).waitFor()
  await go('/study')
  await page.getByRole('button', { name: 'Devam et', exact: true }).waitFor()
  const afterEdit = await page.evaluate(uid => JSON.parse(localStorage.getItem(`examtracker-timer-v1:${uid}`)), uid)
  assert.equal(afterEdit.focusSeconds, 3600, 'editing a preset must not resize the paused session')
  assert.equal(afterEdit.breakSeconds, 720, 'editing preserves the captured break')
  assert.equal(afterEdit.sessionId, snapshot.sessionId)
  assert.equal(await picker.count(), 0, 'cannot change presets on a paused session')
  await go('/settings')
  await page.getByRole('button', { name: 'Pomodoro', exact: true }).click()
  await panel.getByRole('button', { name: 'Derin çalışma sayacını sil' }).click()
  await panel.getByText('Sayaç silindi. Uzun Pomodoro seçildi; devam eden oturumun korunur.', { exact: true }).waitFor()
  assert.equal(user.user_metadata.pomodoro_preferences.selectedId, 'long')
  await page.evaluate(uid => localStorage.removeItem(`examtracker-timer-v1:${uid}`), uid)
  await page.goto(origin + '/study')
  await picker.waitFor(); await page.waitForFunction(() => document.querySelector('[role="timer"]').textContent.replace(/\s/g,'') === '50:00')
  await picker.selectOption('short')
  await page.waitForFunction(() => document.querySelector('[role="timer"]').textContent.replace(/\s/g,'') === '25:00')
  await go('/')
  await page.getByRole('button', { name: /Plansız çalışma başlat/ }).click()
  assert.equal(await page.getByLabel('Oturum', { exact: true }).inputValue(), 'short', 'dashboard uses the same choice')
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(origin + '/study'); await picker.waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `no page overflow at ${width}px`)
    if (width === 375) await page.screenshot({ path: '/tmp/pomodoro-presets-mobile.png', fullPage: true })
    const bounds = await picker.boundingBox(); assert.ok(bounds.width > 100 && bounds.x >= 0 && bounds.x + bounds.width <= width)
  }
  // A fresh sign-in receives the saved account metadata; another account gets
  // its own defaults, not the first account's custom timers or selection.
  const sessionFor = account => ({ access_token: 'fixture', refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 86400, token_type: 'bearer', user: account })
  await page.evaluate(session => { localStorage.clear(); localStorage.setItem('sb-exam-test-auth-token', JSON.stringify(session)) }, sessionFor(user))
  await page.goto(origin + '/study'); await picker.waitFor()
  assert.equal(await picker.inputValue(), 'short', 'new sign-in restores the account choice')
  await page.evaluate(session => { localStorage.clear(); localStorage.setItem('sb-exam-test-auth-token', JSON.stringify(session)) }, sessionFor({ ...user, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'other@example.com', user_metadata: { display_name: 'Other' } }))
  await page.goto(origin + '/study'); await picker.waitFor()
  assert.equal(await picker.inputValue(), 'long', 'another account has an independent default')
  assert.equal(await picker.locator('option').count(), 2)
  assert.deepEqual(errors, [])
  assert.ok(writes.every(write => Object.keys(write.data).join(',') === 'pomodoro_preferences'), 'only the preference metadata key is written')
  console.log('PASS preset CRUD, failed saves, persistent choice, captured active durations, dashboard and mobile/tablet layout')
} finally { clearTimeout(deadline); await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
