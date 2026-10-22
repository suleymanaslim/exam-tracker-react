import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright'

// Run against a production build using the fixture URL/key (see README).
const output = resolve(process.env.PERF_DIST || 'dist')
const uid = '11111111-1111-4111-8111-111111111111'
const examId = '22222222-2222-4222-8222-222222222222'
const subjectId = '33333333-3333-4333-8333-333333333333'
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.com', created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: { display_name: 'Test Kullanıcısı' } }
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' }
const launch = () => chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--no-zygote', '--single-process'] } : {}) })

async function serve(directory) {
  const server = http.createServer(async (req, res) => {
    let file = join(directory, decodeURIComponent(new URL(req.url, 'http://localhost').pathname))
    if (!file.startsWith(directory + '/')) { res.writeHead(403); res.end(); return }
    try { if (!(await stat(file)).isFile()) file = join(directory, 'index.html') }
    catch { file = join(directory, 'index.html') }
    try { res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)) }
    catch { res.writeHead(404); res.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) }
}
async function fixtures(context, { role = 'admin', latency = 40, authLatency = 0, profileLatency = 0 } = {}) {
  const calls = []
  await context.addInitScript(user => {
    try { localStorage.setItem('sb-exam-test-auth-token', JSON.stringify({ access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_at: Math.floor(Date.now() / 1000) + 86400, token_type: 'bearer', user })) } catch { /* about:blank has no storage origin */ }
  }, user)
  await context.route('https://exam-test.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1)
    calls.push({ method: request.method(), table, url: url.href })
    let body = []
    const profile = { id: uid, display_name: 'Test Kullanıcısı', email: user.email, role }
    if (url.pathname.includes('/auth/v1/user')) body = user
    else if (table === 'profiles') body = url.searchParams.has('id') ? profile : [profile]
    else if (table === 'exams') body = [{ id: examId, name: 'YDT', color: '#4269a8', user_id: uid, wrong_penalty: 4, point_per_net: 1.25 }]
    else if (table === 'weekly_plans') body = [{ id: 'week', week_start_date: '2026-10-19' }]
    else if (table === 'subjects') body = [{ id: subjectId, name: 'İngilizce', exam_id: examId, user_id: uid, exams: { name: 'YDT' } }]
    else if (table === 'pomodoro_settings') body = { long_focus_minutes: 50, long_break_minutes: 10, short_focus_minutes: 25, short_break_minutes: 5 }
    else if (table === 'system_settings') body = { value: 'Day 1\nexample: örnek' }
    else if (table === 'ags_topic_preferences') body = { source: 'personal' }
    else if (table === 'get_accessible_monthly_plans') body = [{ plan_owner_id: uid, owner_name: 'Test Kullanıcısı', can_edit: true }]
    else if (table === 'get_dashboard_community') body = { show_widget: false, share_statistics: false, entries: [], daily_message: '' }
    else if (table === 'exam_question_types') body = [{ id: 'q1', exam_id: examId, question_count: 20, name: 'Dil Bilgisi', sort_order: 0 }]
    else if (table === 'exam_results') body = [{ id: 'r1', exam_id: examId, title: 'Deneme - 1', date: '2026-10-01', created_at: '2026-10-01T12:00:00Z', is_draft: false }]
    else if (table === 'exam_result_details') body = [{ id: 'a1', result_id: 'r1', question_type_id: 'q1', correct_count: 15, incorrect_count: 3 }]
    const delay = table === 'user' ? authLatency : table === 'profiles' ? profileLatency : latency
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return calls
}
async function benchmark(directory, label) {
  const benchBrowser = await launch()
  const server = await serve(directory), context = await benchBrowser.newContext()
  const calls = await fixtures(context, { role: 'user', latency: 150, authLatency: 2000, profileLatency: 2000 })
  const page = await context.newPage(), scripts = new Set()
  page.on('request', request => { const url = new URL(request.url()); if (url.origin === server.url && url.pathname.endsWith('.js')) scripts.add(url.pathname) })
  const start = performance.now()
  await page.goto(server.url + '/timed-mock-exam')
  await page.getByRole('button', { name: 'Denemeyi başlat', exact: true }).waitFor()
  const readyMs = Math.round(performance.now() - start)
  let javascriptBytes = 0, javascriptGzipBytes = 0
  for (const file of scripts) { const body = await readFile(join(directory, file)); javascriptBytes += body.length; javascriptGzipBytes += gzipSync(body).length }
  const result = { label, readyMs, javascriptBytes, javascriptGzipBytes, authRequests: calls.filter(call => call.table === 'user').length }
  await benchBrowser.close(); await server.close()
  console.log(JSON.stringify(result))
  return result
}
let browser
try {
  const measurements = []
  if (process.env.PERF_BASELINE_DIST) measurements.push(await benchmark(resolve(process.env.PERF_BASELINE_DIST), 'before'))
  const optimized = await benchmark(output, 'after'); measurements.push(optimized)
  assert.equal(optimized.authRequests, 0, 'Page loading must reuse the existing session without serial auth round-trips')
  assert.ok(optimized.readyMs < 2000, 'Regular account loading must not wait for a slow role/profile query')
  if (measurements.length === 2) {
    assert.ok(optimized.readyMs < measurements[0].readyMs / 2)
    assert.ok(optimized.javascriptGzipBytes < measurements[0].javascriptGzipBytes * .7)
  }
  browser = await launch()
  const server = await serve(output), context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const calls = await fixtures(context), page = await context.newPage(), errors = [], chunks = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (request.url().includes('ExamHistoryChart-')) chunks.push(request.url()) })
  await page.goto(server.url + '/timed-mock-exam')
  await page.getByRole('button', { name: 'Denemeyi başlat', exact: true }).waitFor()
  const initialSubjects = calls.filter(call => call.table === 'subjects').length
  for (const [path, heading] of [
    ['/study', 'Çalışma alanı'], ['/plan', 'Haftalık Plan'], ['/history', 'Çalışma Geçmişi'],
    ['/stats', 'İstatistikler'], ['/results', 'Denemeler'], ['/videos', 'Video Planı'],
    ['/questions', 'Soru planı'], ['/topics', 'Konular'], ['/monthly-plan', 'Aylık konu planı'],
    ['/settings', 'Ayarlar'], ['/admin', 'Kullanıcı Yönetimi'], ['/', 'Dashboard'],
  ]) {
    // Use real client navigation, so the shared cache and lazy routes are exercised.
    const link = page.locator(`.app-sidebar a[href="${path}"]`)
    if (await link.count()) await link.click()
    else await page.goto(server.url + path)
    await page.waitForURL(server.url + path)
    await page.locator('h1').waitFor()
    assert.equal(await page.getByRole('alert').filter({ hasText: 'Sayfa yüklenemedi' }).count(), 0, path)
    assert.ok((await page.locator('h1').innerText()).trim(), `Missing heading at ${path}: ${heading}`)
    if (path === '/results') {
      assert.equal(chunks.length, 0, 'Charts must not load for the result list')
      await page.getByRole('button', { name: 'Gelişim ve Değişimler', exact: true }).click()
      await page.getByText('Deneme geçmişi ve çizgi grafiği', { exact: true }).click()
      await page.locator('.recharts-wrapper').waitFor()
      assert.ok(chunks.length > 0, 'Opening the history graph should load its chart module')
    }
  }
  assert.equal(calls.filter(call => call.table === 'user').length, 0)
  assert.equal(calls.filter(call => call.table === 'profiles' && call.url.includes('id=eq.')).length, 1, 'Dashboard should reuse the layout profile read')
  assert.ok(calls.filter(call => call.table === 'subjects' && !call.url.includes('order=') && call.url.includes('select=*')).length <= initialSubjects, 'Catalog reads should be reused across routes')
  assert.equal(calls.filter(call => call.table === 'profiles' && call.method !== 'GET').length, 0, 'Visiting Dashboard must not rewrite an existing profile')
  assert.deepEqual(errors, [])
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(server.url + '/timed-mock-exam')
  await page.getByRole('button', { name: 'Denemeyi başlat', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await context.close(); await server.close()
  await browser.close()
  browser = await launch()
  const loginServer = await serve(output), loginContext = await browser.newContext()
  const loginPage = await loginContext.newPage()
  await loginPage.goto(loginServer.url + '/login')
  await loginPage.getByRole('heading', { name: 'Hoş geldin', exact: true }).waitFor()
  await browser.close(); browser = null
  await loginServer.close()
  console.log(JSON.stringify({ measurements, routeSmokeChecks: 13, result: 'PASS' }, null, 2))
} finally { await browser?.close() }
