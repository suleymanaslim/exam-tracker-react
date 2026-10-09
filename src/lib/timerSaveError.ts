export function timerSaveError(error: unknown, questions = false) {
  const rawCode = typeof error === 'object' && error !== null && 'code' in error ? error.code : null
  const code = typeof rawCode === 'string' && /^[A-Z0-9]{3,12}$/.test(rawCode) ? rawCode : ''
  const suffix = code ? ` (${code})` : ''
  if (questions && ['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703'].includes(code)) {
    return `Soru kayıt sistemi güncel değil${suffix}. Supabase’de güncel question_plans.sql dosyasını çalıştırın. Oturumun korunuyor; tekrar kaydedebilir veya oturumu unutabilirsin.`
  }
  if (code === '42501') return `Kaydetme izni bulunmuyor${suffix}. Oturumun korunuyor; hesabını kontrol et veya oturumu unut.`
  if (['23514', '22003', '22P02'].includes(code)) return `Süre veya soru sayısı veritabanının kabul ettiği sınırlarla uyuşmuyor${suffix}. Oturumun korunuyor; hata kodunu paylaşabilirsin.`
  if (['PGRST301', 'PGRST302', 'PGRST303'].includes(code)) return `Giriş oturumunu yenilemen gerekiyor${suffix}. Çalışma kaydın bu cihazda korunuyor.`
  return `Kaydedilemedi${suffix}. Süren korunuyor; tekrar kaydetmeyi deneyebilir veya oturumu unutabilirsin.`
}
