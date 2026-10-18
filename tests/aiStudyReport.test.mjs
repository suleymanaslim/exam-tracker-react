import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAIStudyReport } from '../src/lib/aiStudyReport.ts'
import { readOwnedReportRows, fetchAIReportData, AI_REPORT_TABLES } from '../src/lib/aiStudyReportData.ts'

process.env.TZ = 'Europe/Istanbul'
const now = new Date('2026-10-18T15:30:00Z')
const empty = () => Object.fromEntries(Object.keys(AI_REPORT_TABLES).map(key => [key, []]))
const data = () => ({ ...empty(),
  exams: [{ id: 'ags', name: 'AGS', wrong_penalty: 4, point_per_net: 1.25 }, { id: 'yds', name: 'YDS', wrong_penalty: null, point_per_net: 1.25 }],
  subjects: [{ id: 'math', name: 'Sayısal Yetenek', exam_id: 'ags' }, { id: 'verbal', name: 'Sözel Yetenek', exam_id: 'ags' }],
  resources: [{ id: 'res', name: 'Video Kaynağı', subject_id: 'math', avg_video_duration: 30, url: 'PRIVATE_URL', user_id: 'PRIVATE_USER' }],
  weeklyPlans: [{ id: 'legacy', week_start_date: '2026-10-04' }, { id: 'new', week_start_date: '2026-10-12' }, { id: 'future', week_start_date: '2026-10-19' }],
  planItems: [{ id: 'task1', weekly_plan_id: 'legacy', subject_id: 'math', day_of_week: 1, planned_minutes: 120 }, { id: 'task2', weekly_plan_id: 'new', subject_id: 'math', day_of_week: 1, planned_minutes: 90 }, { id: 'task3', weekly_plan_id: 'future', subject_id: 'verbal', day_of_week: 1, planned_minutes: 180 }],
  videos: [{ id: 'video', resource_id: 'res', date: '2026-10-05', video_count: 3, watched_count: 2 }, { id: 'current-video', resource_id: 'res', date: '2026-10-12', video_count: 1, watched_count: 1 }],
  sessions: [{ id: 's1', subject_id: 'math', resource_id: 'res', plan_item_id: 'task1', started_at: '2026-10-05T08:00:00Z', duration_minutes: 60 }, { id: 's2', subject_id: 'math', resource_id: 'res', started_at: '2026-10-11T21:15:00Z', duration_minutes: 15 }, { id: 's3', subject_id: 'math', resource_id: 'res', started_at: '2026-10-13T08:00:00Z', duration_minutes: 30 }],
  questionPlans: [
    { id: 'weekly', subject_id: 'math', resource_id: 'res', date: '2026-10-05', period: 'week', target_questions: 100 },
    { id: 'daily', subject_id: 'math', resource_id: 'res', date: '2026-10-05', period: 'day', target_questions: 30 },
    { id: 'archived', subject_id: 'math', date: '2026-10-05', target_questions: 50, archived_at: '2026-10-12' },
    { id: 'future-question', subject_id: 'verbal', date: '2026-10-19', period: 'week', target_questions: 150 },
  ],
  questionLogs: [
    { id: 'q1', question_plan_id: 'daily', session_id: 's1', solved_questions: 20, correct_questions: null, wrong_questions: null, created_at: '2026-10-05T10:00:00Z', note: 'Problemler' },
    { id: 'q2', question_plan_id: 'daily', session_id: 's3', solved_questions: 10, correct_questions: 8, wrong_questions: 2, created_at: '2026-10-13T10:00:00Z' },
    { id: 'q3', question_plan_id: 'archived', session_id: null, solved_questions: 5, created_at: '2026-10-07T10:00:00Z' },
    { id: 'q-deleted', question_plan_id: 'daily', solved_questions: 100, created_at: '2026-10-05T12:00:00Z', deleted_at: '2026-10-06' },
  ],
  questionTypes: [{ id: 'math-type', exam_id: 'ags', name: 'Sayısal Yetenek', question_count: 15 }],
  results: [{ id: 'mock1', exam_id: 'ags', title: 'Deneme 1', date: '2026-10-06', created_at: '2026-10-06T12:00:00Z' }, { id: 'mock2', exam_id: 'ags', title: 'Deneme 2', date: '2026-10-13', created_at: '2026-10-13T12:00:00Z' }, { id: 'draft', exam_id: 'ags', is_draft: true, title: 'Taslak', date: '2026-10-14', created_at: '2026-10-14T12:00:00Z' }],
  answers: [{ result_id: 'mock1', question_type_id: 'math-type', correct_count: 10, incorrect_count: 4 }, { result_id: 'mock2', question_type_id: 'math-type', correct_count: 12, incorrect_count: 0 }],
  topics: [{ id: 't', subject_id: 'math', title: 'Problemler', is_completed: false }],
})

test('one personalized JSON has all-time, current and previous complete local weeks plus next-week dates', () => {
  const report = buildAIStudyReport(data(), now)
  assert.equal(report.saat_dilimi, 'Europe/Istanbul')
  assert.equal(report.ozetler.son_tamamlanan_hafta.baslangic_dahil, '2026-10-05')
  assert.equal(report.ozetler.son_tamamlanan_hafta.bitis_dahil, '2026-10-11')
  assert.equal(report.ozetler.bu_hafta.baslangic_dahil, '2026-10-12')
  assert.deepEqual(report.sonraki_hafta, { baslangic: '2026-10-19', bitis: '2026-10-25' })
  assert.match(report.prompt, /kişiye özel/)
  assert.match(report.prompt, /soru planı/)
  assert.match(report.prompt, /Pazartesi–Pazar/)
  assert.equal(report.ozetler.son_tamamlanan_hafta.gunler.length, 7)
})
test('actual sessions count once despite matching video progress and question logs; Sunday UTC night is local Monday', () => {
  const report = buildAIStudyReport(data(), now)
  const last = report.ozetler.son_tamamlanan_hafta, current = report.ozetler.bu_hafta
  assert.equal(last.kaydedilen_calisma_dakika, 60)
  assert.equal(last.soru_cozumu_calisma_dakika, 60)
  assert.equal(last.video_plan_tahmini_dakika, 90)
  assert.equal(last.haftalik_plan_dakika, 120)
  assert.equal(current.kaydedilen_calisma_dakika, 45)
  assert.equal(report.ozetler.tum_gecmis.kaydedilen_calisma_dakika, 105)
  assert.equal(report.ozetler.tum_gecmis.haftalik_plan_dakika, 210)
  assert.equal(report.ayrintilar.haftalik_plan_gorevleri[0].tarih, '2026-10-05')
  assert.equal(report.ayrintilar.haftalik_plan_gorevleri[0].dogrudan_bagli_calisma_dakika, 60)
  assert.equal(report.ayrintilar.haftalik_plan_gorevleri.at(-1).tarih, '2026-10-19')
})
test('weekly question targets include daily goals once; archive preserves logs, deletions and future goals excluded', () => {
  const report = buildAIStudyReport(data(), now)
  const last = report.ozetler.son_tamamlanan_hafta
  assert.equal(last.soru_hedefi, 100)
  assert.equal(last.cozulen_soru, 25)
  assert.equal(last.kalan_soru_hedefi, 75)
  assert.equal(last.dogru, null)
  assert.equal(last.yanlis, null)
  assert.equal(report.ozetler.bu_hafta.cozulen_soru, 10)
  assert.equal(report.ozetler.bu_hafta.dogru, 8)
  assert.equal(report.ozetler.tum_gecmis.cozulen_soru, 35)
  assert.equal(report.ozetler.tum_gecmis.soru_hedefi, 100)
  assert.equal(report.ayrintilar.soru_cozumleri.length, 3)
  assert.equal(report.ayrintilar.soru_cozumleri[0].konu_notu, 'Problemler')
})
test('AGS export has nets, blanks, topic changes and no score; drafts and private account fields omitted', () => {
  const report = buildAIStudyReport(data(), now)
  const ags = report.sinavlar[0]
  assert.equal(ags.puan_hesaplanir, false)
  assert.equal(ags.deneme_gecmisi.length, 2)
  assert.equal('puan' in ags.deneme_gecmisi[0], false)
  assert.equal(ags.deneme_gecmisi[0].net, 9)
  assert.equal(ags.deneme_gecmisi[0].soru_turleri[0].bos, 1)
  assert.equal(ags.son_iki_deneme_karsilastirmasi.ders_degisimleri[0].net_degisim, 3)
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_USER|PRIVATE_URL|user_id|point_per_net/)
})
test('empty data and incomplete current week are valid without invented measurements', () => {
  const monday = new Date('2026-10-18T21:00:01Z') // Monday in Istanbul
  const report = buildAIStudyReport(empty(), monday)
  assert.equal(report.ozetler.bu_hafta.gunler.length, 1)
  assert.equal(report.ozetler.bu_hafta.baslangic_dahil, '2026-10-19')
  assert.equal(report.ozetler.son_tamamlanan_hafta.baslangic_dahil, '2026-10-12')
  assert.equal(report.ozetler.tum_gecmis.ilk_kayit_tarihi, null)
  assert.equal(report.ozetler.tum_gecmis.dogru, null)
  assert.doesNotThrow(() => JSON.stringify(report))
})
test('AI export includes the selected user shared AGS completion with its subject name and source', () => {
  const source=data()
  source.topics.push({id:'shared:t',subject_id:'shared:s',subject_name:'Tarih',title:'Ortak konu',is_completed:true,source:'shared_ags'})
  source.sharedTopicsAvailability='available'
  source.agsTopicSource='shared'
  const report=buildAIStudyReport(source,now)
  assert.deepEqual(report.ayrintilar.konular.at(-1),{ders:'Tarih',konu:'Ortak konu',tamamlandi:true,kaynak:'shared_ags'})
  assert.match(report.veri_aciklamalari.ortak_ags_konulari,/dahil/)
})
test('future daily question goals are included in the current full-week target and early work retains its subject', () => {
  const source = data()
  source.questionPlans.push({ id: 'later-today', subject_id: 'math', date: '2026-10-18', target_questions: 20 })
  source.questionLogs.push({ id: 'early', question_plan_id: 'future-question', solved_questions: 5, created_at: '2026-10-17T10:00:00Z' })
  const report = buildAIStudyReport(source, new Date('2026-10-17T15:00:00Z'))
  assert.equal(report.ozetler.bu_hafta.soru_hedefi, 20)
  assert.equal(report.ozetler.tum_gecmis.dersler.find(row => row.ders_id === 'verbal').cozulen_soru, 5)
})

const mockClient = (pages, errorTable = null) => {
  const calls = []
  return { calls, from(table) {
    const call = { table }; calls.push(call)
    return { select(_, options) { call.count = options?.count; return this }, eq(key, value) { call.owner = [key, value]; return this }, order(key) { call.order = key; return this }, async range(start, end) {
      call.range = [start, end]
      return errorTable === table ? { error: { code: '42P01' }, data: null, count: null } : { data: pages.slice(start, end + 1), error: null, count: pages.length }
    } }
  } }
}
test('owner-scoped export fetches more than 1000 rows and an exact multiple without truncation', async () => {
  for (const size of [0, 1000, 1007]) {
    const rows = Array.from({ length: size }, (_, id) => ({ id: String(id), user_id: 'selected-user' }))
    const client = mockClient(rows)
    assert.equal((await readOwnedReportRows(client, 'study_sessions', 'selected-user')).length, size)
    assert.ok(client.calls.every(call => call.owner[0] === 'user_id' && call.owner[1] === 'selected-user' && call.order === 'id'))
    assert.equal(client.calls.length, Math.max(1, Math.ceil(size / 500)))
  }
})
test('export fails on missing question tables, wrong owner and truncated or repeated pages', async () => {
  await assert.rejects(fetchAIReportData(mockClient([], 'question_plans'), 'selected-user'), /question_plans.sql/)
  await assert.rejects(readOwnedReportRows(mockClient([{ id: 'a', user_id: 'other-user' }]), 'study_sessions', 'selected-user'), /doğrulanamadı/)
  const client = mockClient([{ id: 'a', user_id: 'selected-user' }, { id: 'a', user_id: 'selected-user' }])
  await assert.rejects(readOwnedReportRows(client, 'study_sessions', 'selected-user'), /eksik geldi/)
})
