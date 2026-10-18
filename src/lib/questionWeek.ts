import { localDayKey, mondayOf } from './statsPeriod.ts'
import { questionCount, type QuestionPlan } from './questionPlan.ts'

export function questionWeekDays(week: string) {
  const start = mondayOf(new Date(`${week}T12:00:00`))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start); date.setDate(date.getDate() + index)
    return { date: localDayKey(date), label: date.toLocaleDateString('tr-TR', { weekday: 'long' }), short: date.toLocaleDateString('tr-TR', { weekday: 'short' }), day: date.getDate() }
  })
}
export const isQuestionTarget = (plan: Pick<QuestionPlan, 'archived_at' | 'target_questions'>) => !plan.archived_at && plan.target_questions != null && plan.target_questions > 0

export function dailyQuestionTargets(plans: QuestionPlan[], week: string) {
  return questionWeekDays(week).map(day => ({ ...day, plans: plans.filter(plan => isQuestionTarget(plan) && plan.period !== 'week' && plan.date === day.date) }))
}

export function weekTargetPayload(week: string, values: Record<string, string>) {
  const days = questionWeekDays(week), targets: { date: string; target: number }[] = []
  for (const day of days) {
    const raw = values[day.date] || ''
    if (!raw) continue
    const count = questionCount(raw)
    if (count === null) throw new Error(`${day.label} için 1–100.000 arasında tam sayı gir.`)
    targets.push({ date: day.date, target: count })
  }
  if (!targets.length) throw new Error('En az bir güne soru hedefi ekle.')
  return targets
}

export function questionWeekError(error: { code?: string; message?: string; details?: string | null }) {
  if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code || '')) return 'Bu özellik için Supabase’de güncel question_plans.sql dosyasını çalıştırın.'
  if (error.code === '42501') return 'Bu işlem için yetkin bulunmuyor. Başka kullanıcıya kopyalamayı yalnızca admin yapabilir.'
  if (error.message === 'QUESTION_COPY_SUBJECT_MAPPING') {
    try {
      const detail = JSON.parse(error.details || '{}')
      if (typeof detail.subject === 'string' && typeof detail.exam === 'string') return `${detail.exam} / ${detail.subject} hedef hesapta yok veya birden fazla eşleşiyor. Ders ve sınav adlarını kontrol et. Hiçbir hedef kopyalanmadı.`
    } catch { /* Use the fixed message below if the server detail cannot be read. */ }
    return 'Hedef hesapta dersler eşleştirilemedi. Sınav ve ders adları benzersiz biçimde eşleşmeli. Hiçbir hedef kopyalanmadı.'
  }
  if (error.message === 'QUESTION_COPY_EMPTY') return 'Bu haftada kopyalanacak aktif soru hedefi yok.'
  if (error.message === 'QUESTION_COPY_SOURCE_AMBIGUOUS') return 'Kaynak hesapta aynı gün için aynı isimde birden fazla ders veya sınav var. Adları benzersiz hale getir; hiçbir hedef kopyalanmadı.'
  return 'Plan kaydedilemedi. Mevcut hedeflerin korunuyor; tekrar deneyebilirsin.'
}
