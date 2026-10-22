import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve('dist')
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' }
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname
  let file = join(root, path)
  try { if (!(await stat(file)).isFile()) file = join(root, 'index.html') } catch { file = join(root, 'index.html') }
  res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream')
  res.end(await readFile(file))
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const launch = () => chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--no-zygote', '--single-process'] } : {}) })
const uid = '11111111-1111-4111-8111-111111111111', sid = '22222222-2222-4222-8222-222222222222', rid = '33333333-3333-4333-8333-333333333333'
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.com', created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: { display_name: 'Test' } }
const plan = { id: 'p1', user_id: uid, subject_id: sid, resource_id: rid, video_plan_item_id: null, date: '2026-10-22', target_questions: 60, period: 'day', kind: 'extra', created_at: '2026-10-22T09:00:00Z', archived_at: null, subjects: { name: 'İngilizce', exam_id: 'e' }, resources: { name: 'Dil dersleri' } }
const logs = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, question_plan_id: 'p1', session_id: i === 5 ? 's1' : null, user_id: uid, created_at: `2026-10-22T09:0${i}:00Z`, solved_questions: i === 5 ? 12 : 10, correct_questions: 8, wrong_questions: 2, note: `Konu ${i + 1}` }))
const sessions = [{ id: 's1', subject_id: sid, resource_id: rid, session_type: 'manual', duration_minutes: 25, started_at: '2026-10-22T08:30:00Z', ended_at: '2026-10-22T08:55:00Z', note: null, is_edited: false }]
let videos = [
  { id: 'single', user_id: uid, resource_id: rid, date: '2026-10-22', video_count: 1, watched_count: 0, is_completed: false, sort_order: 1, watch_parts_total: 1, watch_parts_done: 0, completion_week: null },
  { id: 'multi', user_id: uid, resource_id: rid, date: '2026-10-22', video_count: 3, watched_count: 0, is_completed: false, sort_order: 2, watch_parts_total: 1, watch_parts_done: 0, completion_week: null },
]
let failSave = true, deleteRequests = 0
const deadline = setTimeout(() => { console.error('Plan browser test timed out'); process.exit(1) }, 90000); deadline.unref()
let browser
try {
  browser = await launch()
  const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, timezoneId: 'Europe/Istanbul', hasTouch: true })
  const page = await context.newPage(), errors = []
  page.setDefaultTimeout(12000)
  console.log('Browser ready')
  await page.clock.install({ time: new Date('2026-10-22T10:00:00Z') })
  page.on('pageerror', error => errors.push(error.message))
  await context.addInitScript(user => { localStorage.setItem('sb-exam-test-auth-token', JSON.stringify({ access_token: 'fixture', refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 86400, token_type: 'bearer', user })) }, user)
  await context.route('https://exam-test.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1), method = request.method()
    const payload = request.postDataJSON(), accept = request.headers()['accept'] || ''
    let data = []
    if (table === 'profiles') data = { id: uid, display_name: 'Test', email: user.email, role: 'user' }
    else if (table === 'user') data = user
    else if (table === 'subjects') data = [{ id: sid, name: 'İngilizce', exam_id: 'e', user_id: uid, exams: { name: 'YDT' } }]
    else if (table === 'exams') data = [{ id: 'e', name: 'YDT', user_id: uid, color: '#4269a8' }]
    else if (table === 'resources') data = [{ id: rid, subject_id: sid, user_id: uid, resource_type: 'video_ders', name: 'Dil dersleri', total_videos: 20, avg_video_duration: 90 }]
    else if (table === 'question_plans') data = [plan]
    else if (table === 'question_session_results') data = url.searchParams.get('select')?.startsWith('note,') ? [...logs].reverse().map(log => ({ note: log.note, question_plans: { subject_id: sid } })) : logs
    else if (table === 'study_sessions') data = sessions
    else if (table === 'video_plan_items') {
      if (method === 'DELETE') { deleteRequests++; const id = url.searchParams.get('id').slice(3); videos = videos.filter(item => item.id !== id); data = null }
      else data = videos
    } else if (table === 'set_video_watch_parts') {
      if (failSave) { failSave = false; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: '503', message: 'fixture outage' }) }); return }
      const item = videos.find(item => item.id === payload.p_item_id), done = payload.p_done === payload.p_total
      Object.assign(item, { watch_parts_total: payload.p_total, watch_parts_done: payload.p_done, watched_count: done ? 1 : 0, is_completed: done, completion_week: done ? '2026-10-19' : null })
      if (done) { item.planned_date = item.date; item.date = '2026-10-19' }
      data = accept.includes('vnd.pgrst.object') ? item : [item]
    } else if (table === 'add_solved_questions') {
      logs.push({ id: payload.p_entry_id, question_plan_id: payload.p_question_plan_id, session_id: null, user_id: uid, created_at: '2026-10-22T10:01:00Z', solved_questions: payload.p_questions, correct_questions: payload.p_correct, wrong_questions: payload.p_wrong, note: payload.p_note })
      data = null
    } else if (table === 'remove_question_result') { const index = logs.findIndex(log => log.id === payload.p_entry_id); if (index >= 0) logs.splice(index, 1); data = null }
    else if (table === 'update_question_result') { Object.assign(logs.find(log => log.id === payload.p_entry_id), { solved_questions: payload.p_questions, note: payload.p_note }); data = null }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  console.log('Fixtures ready')
  // Manual and timed solutions share one history, without duplicate time.
  await page.goto(origin + '/history')
  await page.getByText('Konu 6', { exact: true }).waitFor()
  assert.equal(await page.getByText('Konu 6', { exact: true }).count(), 1)
  assert.equal(await page.getByText('25 dk', { exact: true }).count(), 1)
  assert.equal(await page.getByText('10 soru', { exact: true }).count(), 5)
  console.log('History ready')
  // Last 3 notes appear immediately; older notes expand and collapse.
  await page.locator('.app-sidebar a[href="/questions"]').click()
  await page.getByRole('button', { name: 'Çözülen ekle' }).first().click()
  await page.locator('.question-note-history button').first().waitFor()
  assert.equal(await page.locator('.question-note-history button:not(.question-notes-toggle):visible').count(), 3)
  await page.getByRole('button', { name: 'Önceki notlar (3)', exact: true }).click()
  assert.equal(await page.locator('.question-note-history button:not(.question-notes-toggle):visible').count(), 6)
  await page.getByRole('button', { name: 'Daha az göster' }).click()
  assert.equal(await page.locator('.question-note-history button:not(.question-notes-toggle):visible').count(), 3)
  await page.locator('.swal2-input').fill('17')
  await page.locator('#question-note').fill('Yeni çözüm')
  await page.getByRole('button', { name: 'Ekle', exact: true }).click()
  await page.locator('.swal2-popup').waitFor({ state: 'hidden' })
  await page.locator('.app-sidebar a[href="/history"]').click()
  await page.getByText('Yeni çözüm', { exact: true }).waitFor()
  assert.equal(await page.getByText('17 soru', { exact: true }).count(), 1)
  console.log('Questions ready')
  // Save failure stays in the dialog; partial never counts as watched.
  await page.locator('.app-sidebar a[href="/videos"]').click()
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.getByRole('button', { name: 'Dil dersleri izleme ilerlemesi', exact: true }).first().click()
  await page.getByRole('button', { name: '2 parçadan 1 tamamlandı', exact: true }).click()
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await page.getByText('İlerleme kaydedilemedi. Lütfen tekrar deneyin.', { exact: true }).waitFor()
  assert.equal(videos[0].watch_parts_done, 0)
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await page.locator('.video-resume-item').waitFor()
  assert.equal(videos[0].watched_count, 0)
  assert.match(await page.locator('.video-resume-item').innerText(), /1\/2/)
  await page.screenshot({ path: '/tmp/exam-plan-partial-tablet.png', fullPage: true })
  console.log('Partial saved')
  // Reopen on another calendar week and finish from the persistent left shelf.
  await page.reload()
  await page.locator('.video-resume-item').waitFor()
  await page.getByRole('button', { name: '‹', exact: true }).click()
  await page.locator('.video-resume-item').click()
  assert.equal(await page.getByRole('button', { name: '2 parçadan 1 tamamlandı', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.getByRole('button', { name: '2 parçadan 2 tamamlandı', exact: true }).click()
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await page.getByText('1 video kaydedildi', { exact: true }).waitFor()
  await page.clock.runFor(2200)
  await page.getByRole('button', { name: 'Bugün', exact: true }).click()
  const completed = page.getByRole('button', { name: 'Pazartesiye kaydedilen 1 video', exact: true })
  await completed.waitFor()
  assert.equal(await completed.isDisabled(), true)
  assert.equal(videos[0].date, '2026-10-19')
  assert.equal(videos[0].watched_count, 1)
  assert.equal(await page.locator('.video-resume-item').count(), 0)
  console.log('Monday complete')
  // Multiple videos never offer split controls.
  await page.getByRole('button', { name: 'Dil dersleri izleme ilerlemesi', exact: true }).click()
  assert.equal(await page.locator('#video-parts-total').count(), 0)
  await page.getByRole('button', { name: 'Vazgeç', exact: true }).click()
  await page.locator('.swal2-popup').waitFor({ state: 'hidden' })
  // On a touch viewport the delete action is visible and asks before removing a log.
  await page.setViewportSize({ width: 768, height: 1024 })
  const remove = page.getByRole('button', { name: 'Dil dersleri izleme kaydını sil', exact: true })
  await remove.click()
  await page.getByText('İzlediğiniz video kaydedildi. Silerseniz bu kayıt ve izlenen 1 video toplamdan çıkarılacak.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Vazgeç', exact: true }).click()
  assert.equal(deleteRequests, 0)
  await page.locator('.swal2-popup').waitFor({ state: 'hidden' })
  await remove.click()
  await page.getByRole('button', { name: 'Kaydı sil', exact: true }).click()
  await completed.waitFor({ state: 'hidden' })
  assert.equal(deleteRequests, 1)
  await page.locator('.swal2-popup').waitFor({ state: 'hidden' })
  assert.deepEqual(errors, [])
  await page.screenshot({ path: '/tmp/exam-plan-tablet.png', fullPage: true })
  await page.setViewportSize({ width: 375, height: 812 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await browser.close()
  // Initial module failure shows a recovery screen, rather than leaving a blank page.
  browser = await launch()
  const boot = await browser.newPage()
  await boot.route('**/assets/index-*.js', route => route.abort('failed'))
  await boot.goto(origin + '/login')
  await boot.getByText('Sayfa yüklenemedi. Bağlantını kontrol edip yeniden dene.', { exact: true }).waitFor()
  assert.equal(await boot.getByRole('button', { name: 'Yeniden dene', exact: true }).isVisible(), true)
  console.log('PASS: history, three-note disclosure, save retry, partial reload, cross-week completion, immutable Monday, multi-video exclusion, confirmed deletion, boot recovery')
} finally { await browser?.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); clearTimeout(deadline) }
