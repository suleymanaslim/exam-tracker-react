export type ExamTemplateKey = 'ags' | 'yds' | 'ales' | 'ielts'
export interface ExamTemplate {
  template_key: ExamTemplateKey; name: string; description: string;
  wrong_penalty: number | null; point_per_net: number;
  question_types: { name: string; question_count: number }[]
}

export function examTemplateKey(name: string): ExamTemplateKey | null {
  const key = name.trim().toUpperCase()
  if (['AGS', 'MEB-AGS', 'MEB AGS'].includes(key)) return 'ags'
  if (['YDS', 'E-YDS'].includes(key)) return 'yds'
  return key === 'ALES' ? 'ales' : key === 'IELTS' ? 'ielts' : null
}

export function readExamTemplate(value: unknown): ExamTemplate {
  const row = value as ExamTemplate | null
  if (!row || !['ags', 'yds', 'ales', 'ielts'].includes(row.template_key) || typeof row.name !== 'string'
    || typeof row.description !== 'string' || !Number.isFinite(row.point_per_net) || row.point_per_net <= 0
    || row.wrong_penalty !== null && (!Number.isFinite(row.wrong_penalty) || row.wrong_penalty < 0)
    || !Array.isArray(row.question_types) || row.question_types.length === 0
    || row.question_types.some(q => !q || typeof q.name !== 'string' || !q.name.trim() || !Number.isInteger(q.question_count) || q.question_count < 0)) {
    throw new Error('Sınav şablonu doğrulanamadı.')
  }
  return row
}

export function examScoreLabel(exam?: { base_template_key?: string | null; point_per_net?: number; wrong_penalty?: number | null } | null) {
  if (exam?.base_template_key === 'ielts') return (exam.point_per_net ?? 1) === 1 && !exam.wrong_penalty ? 'Ham doğru' : 'Takip puanı'
  return ['ags', 'ales'].includes(exam?.base_template_key || '') ? 'Takip puanı' : 'Puan'
}

export function examTemplateError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  if (['PGRST202', 'PGRST205', '42P01', '42703'].includes(String(code))) return 'Başlangıç şablonlarını etkinleştirmek için Supabase’de exam_templates.sql dosyasını çalıştırın.'
  if (code === '42501') return 'Bu işlem için kendi yönetici hesabını kullanmalısın.'
  if (code === '22023') return 'Şablon için geçerli soru türleri ve puanlama ayarları tanımlanmalı.'
  return 'Sınav şablonu işlemi tamamlanamadı. Lütfen tekrar dene.'
}
