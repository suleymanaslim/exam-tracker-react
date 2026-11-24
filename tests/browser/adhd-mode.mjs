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
  { id: 't1', user_id: uid, task_date: today, subject_id: subjects[0].id, note: '20 soru', sort_order: 0, studied_seconds: 0, completed_at: null, topic_kind: 'shared', topic_id: 'k1', topic_title: 'Osmanlı Kuruluş', topic_completed_at: null, subjects: { name: 'Tarih' } },
  { id: 't2', user_id: uid, task_date: today, subject_id: subjects[1].id, note: null, sort_order: 1, studied_seconds: 0, completed_at: null, topic_kind: null, topic_id: null, topic_title: null, topic_completed_at: null, subjects: { name: 'Sözel Yetenek' } },
]
// Ortak AGS konu listesi (kişi bu listeyi DEHB ekranında hiç görmez). Kişisel konular kullanılmaz.
const sharedSubjects = [{ id: 'ss1', name: 'Tarih', sort_order: 0 }, { id: 'ss2', name: 'Sözel Yetenek', sort_order: 1 }]
const topics = [
  ...['Osmanlı Kuruluş', 'Osmanlı Yükselme', 'Duraklama', 'Gerileme', 'Dağılma'].map((title, i) => ({ id: `k${i + 1}`, subject_id: 'ss1', title, sort_order: i, archived_at: null, is_completed: false })),
  ...['Paragraf', 'Sözcükte Anlam'].map((title, i) => ({ id: `s${i + 1}`, subject_id: 'ss2', title, sort_order: i, archived_at: null, is_completed: false })),
]
const personalTopics = [{ id: 'p1', user_id: uid, subject_id: subjects[0].id, title: 'KİŞİSEL KONU', is_completed: false, sort_order: 0 }]
const topicCalls = []
const rpcCalls = [], inserts = [], errors = []
let planSets = []
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
        else data = url.searchParams.get('user_id') ? (url.searchParams.get('user_id') === `eq.${uid}` ? { enabled } : null) : [{ user_id: uid, enabled }]
      } else if (table === 'adhd_daily_tasks') {
        if (request.method() === 'POST') {
          const body = request.postDataJSON()
          for (const row of Array.isArray(body) ? body : [body]) {
            inserts.push(row)
            tasks.push({ id: `t${tasks.length + 1}-${Math.random().toString(36).slice(2)}`, studied_seconds: 0, completed_at: null, topic_completed_at: null, ...row, subjects: { name: subjects.find(s => s.id === row.subject_id).name } })
          }
        } else if (request.method() === 'DELETE') {
          const filter = url.searchParams.get('id') || ''
          const ids = filter.startsWith('in.(') ? filter.slice(4, -1).split(',').map(id => id.replace(/"/g, '')) : [filter.replace('eq.', '')]
          tasks = tasks.filter(task => !ids.includes(task.id))
        } else if (request.method() === 'PATCH') {
          const task = tasks.find(t => t.id === url.searchParams.get('id').replace('eq.', '')); Object.assign(task, request.postDataJSON())
        } else {
          const filters = url.searchParams.getAll('task_date'), withTopic = url.searchParams.get('topic_id') === 'not.is.null'
          const test = date => filters.every(f => f.startsWith('eq.') ? date === f.slice(3) : f.startsWith('gte.') ? date >= f.slice(4) : f.startsWith('lte.') ? date <= f.slice(4) : true)
          data = tasks.filter(task => test(task.task_date) && (!withTopic || task.topic_id)).sort((a, b) => a.task_date.localeCompare(b.task_date) || a.sort_order - b.sort_order)
        }
      } else if (table === 'adhd_plan_sets') {
        if (request.method() === 'POST') { const row = request.postDataJSON(); planSets.push({ id: `set${planSets.length + 1}`, created_at: '2026-11-24T10:00:00Z', ...row }) }
        else if (request.method() === 'DELETE') planSets = planSets.filter(set => `eq.${set.id}` !== url.searchParams.get('id'))
        else data = planSets
      } else if (table === 'weekly_plans') data = [{ id: 'wp1', week_start_date: '2026-11-23' }]
      else if (table === 'plan_items') data = [
        { day_of_week: 3, subject_id: 'a1', title: 'Video ders', sort_order: 0 },
        { day_of_week: 3, subject_id: 'a2', title: null, sort_order: 1 },
        { day_of_week: 4, subject_id: null, title: 'Genel tekrar', sort_order: 0 },
      ]
      else if (table === 'record_adhd_task_study') {
        const body = request.postDataJSON(); rpcCalls.push(body)
        const task = tasks.find(t => t.id === body.p_task_id)
        task.studied_seconds += Math.floor((Date.parse(body.p_ended_at) - Date.parse(body.p_started_at)) / 1000)
        if (task.studied_seconds >= 60) task.completed_at ??= body.p_ended_at
        data = task
      } else if (table === 'set_adhd_task_topic_done') {
        const body = request.postDataJSON(); topicCalls.push(body)
        const task = tasks.find(t => t.id === body.p_task_id)
        for (const other of tasks.filter(t => t.topic_id === task.topic_id)) other.topic_completed_at = body.p_done ? '2026-11-24T10:05:00Z' : null
        topics.find(topic => topic.id === task.topic_id).is_completed = body.p_done
        data = task
      } else if (table === 'topics') data = personalTopics
      else if (table === 'ags_topic_preferences') data = { source: 'personal' }
      else if (table === 'ags_shared_subjects') data = sharedSubjects
      else if (table === 'ags_shared_topics') data = topics.map(({ is_completed: _done, ...topic }) => topic)
      else if (table === 'ags_topic_progress') data = topics.filter(topic => topic.is_completed).map(topic => ({ user_id: uid, topic_id: topic.id, is_completed: true }))
      else if (table === 'subjects') data = url.searchParams.get('user_id') === `eq.${adminId}` ? [{ id: 'a1', name: 'Tarih' }, { id: 'a2', name: 'Coğrafya' }] : subjects
      else if (table === 'dashboard_community_preferences') data = []
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })
    const page = await context.newPage(); page.setDefaultTimeout(10000)
    page.on('pageerror', error => errors.push(error.message))
    return { context, page }
  }

  // Kullanıcı: yalnızca bugünün dersleri görünür, menü yoktur.
  const { page } = await open(account(uid, 'Ayşe'), { width: 390, height: 844 })
  await page.goto(origin + '/stats')
  await page.getByRole('heading', { name: 'Bugün yapacakların' }).waitFor()
  assert.equal(await page.locator('.app-sidebar, .app-mobile-nav').count(), 0, 'normal navigation is hidden')
  assert.equal(await page.getByText('Pomodoro').count(), 0)
  await page.getByText('0 / 2 ders yapıldı').waitFor()
  if (shots) await page.screenshot({ path: `${shots}/adhd-today.png`, fullPage: true })

  await page.getByRole('button', { name: 'Başla', exact: true }).click()
  await page.getByRole('heading', { name: 'Osmanlı Kuruluş', level: 1 }).waitFor()
  assert.ok(await page.locator('.adhd-focus-topic-big').evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 38, 'topic title is shown large')
  await page.clock.fastForward(30_000)
  await page.getByRole('button', { name: 'Bitir' }).click()
  await page.getByText('Henüz 1 dakika olmadı.').waitFor()
  assert.equal(rpcCalls.length, 0, 'under one minute nothing is saved without asking')
  await page.getByRole('button', { name: 'Devam et' }).click()
  await page.clock.fastForward(40_000)
  // Süre gösterilmez; yalnızca bitirmeyi hatırlatır.
  await page.getByText('basmayı unutma', { exact: false }).waitFor()
  assert.equal(await page.getByText(/\d\d:\d\d/).count(), 0, 'no running clock is shown')
  assert.equal(await page.getByText('istediğin kadar devam et', { exact: false }).count(), 0)
  if (shots) await page.screenshot({ path: `${shots}/adhd-focus.png` })
  // Yenileme kronometreyi sıfırlamaz.
  await page.reload()
  await page.getByRole('heading', { name: 'Osmanlı Kuruluş', level: 1 }).waitFor()
  await page.getByRole('button', { name: 'Bitir' }).click()
  await page.getByText('1 / 2 ders yapıldı').waitFor()
  await page.getByText('Harika!').waitFor()
  await page.getByText('1 dakika çalıştın.').waitFor()
  // Konu sorusu: kişi yalnızca bugünün konusunu görür ve bitirdiğini işaretler.
  const ask = page.getByRole('region', { name: 'Osmanlı Kuruluş' })
  await ask.getByText('Bu konuyu bitirdin mi?').waitFor()
  if (shots) await page.screenshot({ path: `${shots}/adhd-topic-ask.png`, fullPage: true })
  await ask.getByRole('button', { name: 'Evet, bitti' }).click()
  await page.getByText('Konu bitti:').waitFor()
  assert.deepEqual(topicCalls, [{ p_task_id: 't1', p_done: true }])
  assert.equal(topics[0].is_completed, true)
  assert.equal(await page.getByText('Duraklama').count(), 0, 'other topics are never shown to the person')
  assert.equal(rpcCalls.length, 1)
  assert.ok(Date.parse(rpcCalls[0].p_ended_at) - Date.parse(rpcCalls[0].p_started_at) >= 60_000)
  if (shots) await page.screenshot({ path: `${shots}/adhd-after.png`, fullPage: true })

  // Admin: küçük pencere yalnızca anahtar + bugün + haftalık plana geçiş.
  const adminView = await open(account(adminId, 'Admin'), { width: 1280, height: 900 })
  await adminView.page.goto(origin + '/admin')
  await adminView.page.getByRole('button', { name: 'Ayşe için DEHB modu ve günlük plan' }).click()
  const dialog = adminView.page.getByRole('dialog', { name: 'DEHB modu' })
  await dialog.getByText('Tarih · Osmanlı Kuruluş').waitFor()
  await dialog.getByText('Konu bitti', { exact: false }).first().waitFor()
  if (shots) await adminView.page.screenshot({ path: `${shots}/adhd-admin.png` })
  await dialog.getByRole('switch').click()
  await dialog.getByText('DEHB modu kapalı').waitFor()
  assert.equal(enabled, false)
  assert.ok(await adminView.page.locator('.app-sidebar').count() > 0, 'admin keeps the full layout')
  await dialog.getByRole('switch').click()
  await dialog.getByText('DEHB modu açık').waitFor()

  // Haftalık sayfa: ders + sıradaki konu, kendi planından kopyala, gün kopyala, set kaydet/uygula.
  await dialog.getByRole('button', { name: /Haftalık planı aç/ }).click()
  const plan = adminView.page
  await plan.getByRole('heading', { name: 'DEHB Haftalık Plan' }).waitFor()
  assert.equal(await plan.getByRole('combobox', { name: 'Kişi' }).inputValue(), uid)
  await plan.getByRole('tab', { name: /^Sal/ }).getByText('2 ders').waitFor()
  const topicSelect = plan.getByRole('combobox', { name: 'Konu' })
  await plan.waitForFunction(() => document.querySelector('select[aria-label="Konu"]')?.value === 'shared:k2')
  await plan.getByRole('textbox', { name: /Kısa not/ }).fill('Video + 10 soru')
  inserts.length = 0
  await plan.getByRole('button', { name: 'Ekle', exact: true }).click()
  await plan.getByRole('tabpanel').getByText('Konu: Osmanlı Yükselme').waitFor()
  await plan.locator('.plan-form select').first().selectOption(subjects[1].id)
  assert.equal(await topicSelect.inputValue(), 'shared:s1')
  assert.equal(await topicSelect.getByText('KİŞİSEL KONU').count(), 0, 'personal topics are never offered')
  await plan.getByRole('button', { name: 'Ekle', exact: true }).click()
  await plan.getByRole('tabpanel').getByText('Konu: Paragraf').waitFor()
  assert.deepEqual(inserts.map(row => [row.task_date, row.subject_id, row.topic_id, row.topic_title, row.note]), [
    [today, subjects[0].id, 'k2', 'Osmanlı Yükselme', 'Video + 10 soru'], [today, subjects[1].id, 's1', 'Paragraf', null],
  ])

  await plan.getByRole('button', { name: 'Kendi planımdan: bu hafta' }).click()
  await plan.getByText('Kendi planından 2 ders kopyalandı. Dersi seçilmemiş 1 madde atlandı.', { exact: false }).waitFor()
  inserts.length = 0
  await plan.getByRole('button', { name: 'Bu haftaya yapıştır' }).click()
  await plan.getByRole('button', { name: 'Yanına ekle' }).click()
  await plan.getByText('Bu kişide olmadığı için atlananlar: Coğrafya', { exact: false }).waitFor()
  assert.deepEqual(inserts.map(row => [row.task_date, row.subject_id, row.note, row.topic_id]), [['2026-11-25', subjects[0].id, 'Video ders', 'k3']])
  await plan.getByRole('tab', { name: /^Çar/ }).click()
  await plan.getByRole('tabpanel').getByText('Konu: Duraklama').waitFor()
  await plan.getByRole('button', { name: 'Günü kopyala' }).click()
  await plan.getByRole('tab', { name: /^Cum/ }).click()
  await plan.getByRole('button', { name: 'Cuma gününe yapıştır' }).click()
  await plan.getByRole('tabpanel').getByText('Konu: Duraklama').waitFor()

  // Set dersleri tutar; uygulandığında her ders sıradaki konuyla ilerler.
  await plan.getByLabel('Set adı').fill('Normal hafta')
  await plan.getByRole('button', { name: 'Bu haftayı set yap' }).click()
  await plan.getByText('“Normal hafta” seti kaydedildi (6 ders).').waitFor()
  assert.deepEqual(planSets[0].items.map(item => [item.day, item.subject_name, item.topic_title ?? null]), [
    [2, 'Tarih', null], [2, 'Sözel Yetenek', null], [2, 'Tarih', null], [2, 'Sözel Yetenek', null], [3, 'Tarih', null], [5, 'Tarih', null],
  ])
  await plan.getByRole('button', { name: 'Sonraki hafta' }).click()
  await plan.getByRole('tab', { name: /^Sal/ }).getByText('Plan yok').waitFor()
  inserts.length = 0
  await plan.getByRole('button', { name: 'Bu haftaya uygula' }).click()
  await plan.getByText('“Normal hafta” uygulandı: 6 ders eklendi, 3 tanesine sıradaki konu atandı.').waitFor()
  assert.deepEqual(inserts.map(row => [row.task_date, row.topic_id]), [
    ['2026-12-01', 'k4'], ['2026-12-01', 's2'], ['2026-12-01', 'k5'], ['2026-12-01', null], ['2026-12-02', null], ['2026-12-04', null],
  ])
  await plan.getByRole('tab', { name: /^Sal/ }).click()
  await plan.getByRole('tabpanel').getByText('Konu: Gerileme').waitFor()
  // Admin konu durumunu da değiştirebilir.
  await plan.getByRole('button', { name: 'Gerileme konusunu bitti işaretle' }).click()
  await plan.getByText('“Gerileme” bitti olarak işaretlendi.').waitFor()
  assert.equal(topics[3].is_completed, true)
  // Konu ilerlemesi: tamamlanan ortak konular tik ile görünür.
  const tarihList = plan.getByRole('list', { name: 'Tarih konuları' })
  assert.equal(await tarihList.getByLabel('Tamamlandı').count(), 2)
  await plan.getByText('2 / 7 konu bitti').waitFor()
  if (shots) { await plan.getByRole('heading', { name: 'Konu ilerlemesi' }).scrollIntoViewIfNeeded(); await plan.screenshot({ path: `${shots}/adhd-topic-progress.png` }) }
  if (shots) { await plan.getByRole('button', { name: 'Önceki hafta' }).click(); await plan.getByRole('tab', { name: /^Sal/ }).click(); await plan.waitForTimeout(300); await plan.screenshot({ path: `${shots}/adhd-week-plan.png`, fullPage: true }) }

  // "Hesaba Gir": admin kişinin DEHB ekranını görür, istersen tam görünüme geçer.
  await plan.goto(origin + `/?impersonate=${uid}`)
  await plan.getByText('Admin görünümü').waitFor()
  await plan.getByRole('heading', { name: 'Bugün yapacakların' }).waitFor()
  assert.equal(await plan.getByRole('button', { name: 'Çıkış yap' }).count(), 0)
  if (shots) await plan.screenshot({ path: `${shots}/adhd-impersonate.png` })
  await plan.getByRole('button', { name: 'Tam görünüm' }).click()
  await plan.getByText('Kullanıcı hesabını görüntülüyorsun').waitFor()
  await plan.getByRole('button', { name: 'DEHB görünümüne dön' }).click()
  await plan.getByText('Admin görünümü').waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS today-only view, stopwatch with 1-minute completion, topic completion, reload recovery, weekly plan with next-topic progression, copy/paste, sets and impersonated ADHD view')
} finally { clearTimeout(deadline); await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
