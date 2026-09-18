import { supabase } from './supabase'

export async function resetAllData(userId: string) {
  // 1) Her şeyi sil (Foreign Key constraintlerine takılmamak için sırayla)
  await supabase.from('plan_items').delete().eq('user_id', userId)
  await supabase.from('weekly_plans').delete().eq('user_id', userId)
  await supabase.from('study_sessions').delete().eq('user_id', userId)
  await supabase.from('resources').delete().eq('user_id', userId)
  await supabase.from('subjects').delete().eq('user_id', userId)
  await supabase.from('exams').delete().eq('user_id', userId)
}

/**
 * Mevcut subjects, resources siler ve yeni JSON verisini ekler.
 * Ayrıca 2026-07-06 haftası için plan oluşturur.
 */
export async function seedAllData(userId: string) {
  await resetAllData(userId)

  // Exam name -> id haritası
  const examMap: Record<string, string> = {}

  // 2) Sınavları sıfırdan ekle
  const examDefs = [
    { name: 'AGS', color: '#3b82f6' },
    { name: 'YDS', color: '#22c55e' },
    { name: 'IELTS', color: '#a855f7' },
    { name: 'ALES', color: '#f97316' },
  ]

  for (const def of examDefs) {
    const { data } = await supabase.from('exams').insert({ user_id: userId, name: def.name, color: def.color }).select().single()
    if (data) examMap[def.name] = data.id
  }

  // 3) Subjects ekle
  const subjectDefs = [
    { exam: 'AGS', name: 'Eğitim Bilimleri ve Türk Milli Eğitim Sistemi' },
    { exam: 'AGS', name: 'Mevzuat Bilgisi' },
    { exam: 'AGS', name: 'Tarih' },
    { exam: 'AGS', name: 'Türkiye Coğrafyası' },
    { exam: 'AGS', name: 'Sayısal Yetenek' },
    { exam: 'AGS', name: 'Sözel Yetenek' },
    { exam: 'YDS', name: 'YDS/YÖKDİL Genel' },
    { exam: 'YDS', name: 'Kelime Çalışması' },
    { exam: 'IELTS', name: 'Listening' },
    { exam: 'IELTS', name: 'Reading' },
    { exam: 'IELTS', name: 'Writing' },
    { exam: 'IELTS', name: 'Speaking' },
    { exam: 'ALES', name: 'Temel Matematik' },
    { exam: 'ALES', name: 'Paragraf / Sözel' },
  ]

  const subjectMap: Record<string, string> = {}
  for (const s of subjectDefs) {
    const { data, error } = await supabase.from('subjects').insert({
      user_id: userId, exam_id: examMap[s.exam], name: s.name,
    }).select().single()
    if (error) console.error('Subject insert error:', error, s)
    if (data) subjectMap[s.name] = data.id
  }

  // 4) Resources ekle
  const resourceDefs = [
    { subject: 'Eğitim Bilimleri ve Türk Milli Eğitim Sistemi', name: 'MEB-AGS Eğitim Bilimleri ve Türk Milli Eğitim Sistemi Video Ders Notları', author: 'Zeynep Salman İçli', publisher: 'İndeks Akademi Yayıncılık', resource_type: 'video_ders' },
    { subject: 'Eğitim Bilimleri ve Türk Milli Eğitim Sistemi', name: 'MEB-AGS Eğitim Bilimleri ve Türk Milli Eğitim Sistemi Soru Bankası Çözümlü', author: 'Zeynep Salman İçli', publisher: 'İndeks Akademi Yayıncılık', resource_type: 'soru_bankasi' },
    { subject: 'Mevzuat Bilgisi', name: 'MEB-AGS Mevzuat Bilgisi Video Ders Notları', author: 'Emrah Vahap Özkaraca, Zeynep Salman İçli', publisher: 'İndeks Akademi Yayıncılık', resource_type: 'video_ders' },
    { subject: 'Mevzuat Bilgisi', name: 'MEB-AGS Mevzuat Bilgisi Soru Bankası Çözümlü', author: 'Emrah Vahap Özkaraca, Zeynep Salman İçli', publisher: 'İndeks Akademi Yayıncılık', resource_type: 'soru_bankasi' },
    { subject: 'Tarih', name: 'MEB AGS Tarih Video Ders Notları', author: 'Aydın Yüce', publisher: 'İndeks Akademi Yayıncılık', resource_type: 'video_ders' },
    { subject: 'Tarih', name: 'MEB AGS Tarih Soru Bankası Çözümlü', author: 'Aydın Yüce', publisher: 'İndeks Akademi Yayıncılık', resource_type: 'soru_bankasi' },
    { subject: 'Türkiye Coğrafyası', name: 'MEB AGS Türkiye Coğrafyası Video Ders Notları', author: 'Alican Demir', publisher: 'İndeks Akademi Yayıncılık', resource_type: 'video_ders' },
    { subject: 'Türkiye Coğrafyası', name: 'MEB AGS Türkiye Coğrafyası Soru Bankası Çözümlü', author: 'Alican Demir', publisher: 'İndeks Akademi Yayıncılık', resource_type: 'soru_bankasi' },
    { subject: 'Sayısal Yetenek', name: 'MEB AGS Sayısal Yetenek Video Ders Notları', author: 'Metin Şimşek', publisher: 'İndeks Akademi Yayıncılık', resource_type: 'video_ders' },
    { subject: 'Sayısal Yetenek', name: 'MEB AGS Sayısal Yetenek Soru Bankası Çözümlü', author: 'Metin Şimşek', publisher: 'İndeks Akademi Yayıncılık', resource_type: 'soru_bankasi' },
    { subject: 'Sözel Yetenek', name: 'MEB AGS Sözel Yetenek Video Ders Notları', author: 'Berk Ekici', publisher: 'İndeks Akademi Yayıncılık', resource_type: 'video_ders' },
    { subject: 'Sözel Yetenek', name: 'MEB AGS Sözel Yetenek Soru Bankası Çözümlü', author: 'Berk Ekici', publisher: 'İndeks Akademi Yayıncılık', resource_type: 'soru_bankasi' },
    { subject: 'YDS/YÖKDİL Genel', name: 'Makalelerle YDS', author: null, publisher: null, resource_type: 'kitap' },
    { subject: 'YDS/YÖKDİL Genel', name: 'Geçmiş YDS Sınavları', author: null, publisher: null, resource_type: 'deneme' },
    { subject: 'YDS/YÖKDİL Genel', name: 'Geçmiş YÖKDİL Sınavları', author: null, publisher: null, resource_type: 'deneme' },
    { subject: 'Kelime Çalışması', name: '60 Günde YDS Kelimeleri', author: null, publisher: null, resource_type: 'kitap' },
    { subject: 'Kelime Çalışması', name: 'Vocabulary Kaynağı', author: null, publisher: null, resource_type: 'diger' },
    { subject: 'Listening', name: 'IELTS Official Cambridge Guide', author: null, publisher: 'Cambridge', resource_type: 'kitap' },
    { subject: 'Listening', name: 'IELTS Liz', author: null, publisher: null, resource_type: 'site', url: 'https://ieltsliz.com' },
    { subject: 'Reading', name: 'IELTS Official Cambridge Guide', author: null, publisher: 'Cambridge', resource_type: 'kitap' },
    { subject: 'Reading', name: 'IELTS Liz', author: null, publisher: null, resource_type: 'site', url: 'https://ieltsliz.com' },
    { subject: 'Writing', name: 'IELTS Official Cambridge Guide', author: null, publisher: 'Cambridge', resource_type: 'kitap' },
    { subject: 'Writing', name: 'IELTS Liz', author: null, publisher: null, resource_type: 'site', url: 'https://ieltsliz.com' },
    { subject: 'Speaking', name: 'IELTS Liz', author: null, publisher: null, resource_type: 'site', url: 'https://ieltsliz.com' },
    { subject: 'Speaking', name: 'Mock Test Sitesi (belirlenecek)', author: null, publisher: null, resource_type: 'site' },
    { subject: 'Temel Matematik', name: 'Yediiklim Temel Matematik', author: null, publisher: 'Yediiklim Yayınları', resource_type: 'kitap' },
    { subject: 'Paragraf / Sözel', name: 'Pegem Paragraf', author: null, publisher: 'Pegem Yayınları', resource_type: 'kitap' }
  ]

  const resourceMap: Record<string, string> = {}
  for (const r of resourceDefs) {
    const { data, error } = await supabase.from('resources').insert({
      user_id: userId,
      subject_id: subjectMap[r.subject],
      name: r.name,
      author: (r as any).author ?? null,
      publisher: (r as any).publisher ?? null,
      resource_type: r.resource_type,
      url: (r as any).url ?? null,
    }).select().single()
    if (error) console.error('Resource insert error:', error, r)
    if (data) resourceMap[r.name] = data.id
  }

  // 5) Haftalık plan oluştur (2026-07-06)
  const weekStart = '2026-07-06'
  // Önce varsa sil
  const { data: existingPlan } = await supabase.from('weekly_plans').select('id').eq('user_id', userId).eq('week_start_date', weekStart).single()
  if (existingPlan) {
    await supabase.from('plan_items').delete().eq('weekly_plan_id', existingPlan.id)
    await supabase.from('weekly_plans').delete().eq('id', existingPlan.id)
  }

  const { data: plan } = await supabase.from('weekly_plans').insert({
    user_id: userId,
    week_start_date: weekStart,
    notes: 'İlk hafta - odak süresi toparlanıyor, günlük 4-5 saat',
  }).select().single()

  if (!plan) return { success: false, error: 'Plan oluşturulamadı' }

  const planItems = [
    { day: 1, subject: 'Eğitim Bilimleri ve Türk Milli Eğitim Sistemi', resource: 'MEB-AGS Eğitim Bilimleri ve Türk Milli Eğitim Sistemi Video Ders Notları', title: 'Video ders', minutes: 90 },
    { day: 1, subject: 'Mevzuat Bilgisi', resource: 'MEB-AGS Mevzuat Bilgisi Video Ders Notları', title: 'Video ders', minutes: 90 },
    { day: 1, subject: 'Kelime Çalışması', resource: '60 Günde YDS Kelimeleri', title: 'Günlük 30-40 kelime', minutes: 60 },
    { day: 1, subject: 'Kelime Çalışması', resource: 'Vocabulary Kaynağı', title: 'Vocabulary pratiği', minutes: 30 },

    { day: 2, subject: 'YDS/YÖKDİL Genel', resource: 'Makalelerle YDS', title: 'Okuma + çeviri', minutes: 90 },
    { day: 2, subject: 'YDS/YÖKDİL Genel', resource: 'Geçmiş YDS Sınavları', title: 'Soru çözümü', minutes: 60 },
    { day: 2, subject: 'Listening', resource: 'IELTS Liz', title: 'Focused listening pratiği', minutes: 60 },
    { day: 2, subject: 'Reading', resource: 'IELTS Official Cambridge Guide', title: 'Reading pratiği', minutes: 60 },

    { day: 3, subject: 'Tarih', resource: 'MEB AGS Tarih Video Ders Notları', title: 'Video ders', minutes: 90 },
    { day: 3, subject: 'Türkiye Coğrafyası', resource: 'MEB AGS Türkiye Coğrafyası Video Ders Notları', title: 'Video ders', minutes: 90 },
    { day: 3, subject: 'Kelime Çalışması', resource: '60 Günde YDS Kelimeleri', title: 'Önceki günün kelime tekrarı', minutes: 60 },
    { day: 3, subject: 'Kelime Çalışması', resource: 'Vocabulary Kaynağı', title: 'Vocabulary pratiği', minutes: 30 },

    { day: 4, subject: 'Temel Matematik', resource: 'Yediiklim Temel Matematik', title: 'Konu çalışması', minutes: 120 },
    { day: 4, subject: 'Sayısal Yetenek', resource: 'MEB AGS Sayısal Yetenek Video Ders Notları', title: 'Video ders', minutes: 90 },
    { day: 4, subject: null, resource: null, title: 'Karma soru çözümü (Matematik + Sayısal Yetenek)', minutes: 60 },

    { day: 5, subject: 'YDS/YÖKDİL Genel', resource: 'Geçmiş YDS Sınavları', title: 'Haftalık deneme sınavı + değerlendirme', minutes: 120 },
    { day: 5, subject: 'Speaking', resource: 'IELTS Liz', title: 'Speaking pratiği', minutes: 60 },
    { day: 5, subject: 'Speaking', resource: 'Mock Test Sitesi (belirlenecek)', title: 'Mock Test pratiği', minutes: 60 },
    { day: 5, subject: 'Writing', resource: 'IELTS Official Cambridge Guide', title: 'Writing pratiği', minutes: 90 },

    { day: 6, subject: 'Paragraf / Sözel', resource: 'Pegem Paragraf', title: 'Paragraf çalışması', minutes: 90 },
    { day: 6, subject: 'Sözel Yetenek', resource: 'MEB AGS Sözel Yetenek Video Ders Notları', title: 'Video ders', minutes: 90 },
    { day: 6, subject: null, resource: null, title: 'Haftalık genel tekrar + karışık soru bankası', minutes: 90 },
  ]

  const rows = planItems.map((item, i) => ({
    user_id: userId,
    weekly_plan_id: plan.id,
    day_of_week: item.day,
    subject_id: item.subject ? subjectMap[item.subject] ?? null : null,
    resource_id: item.resource ? resourceMap[item.resource] ?? null : null,
    title: item.title,
    planned_minutes: item.minutes,
    sort_order: i,
  }))

  await supabase.from('plan_items').insert(rows)

  return { success: true }
}
