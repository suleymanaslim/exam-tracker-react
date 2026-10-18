import type { SupabaseClient } from '@supabase/supabase-js'
import { examTemplateKey } from './examTemplates.ts'

export type AgsTopicSource = 'shared' | 'personal'
export const topicSourceLabel = (source: AgsTopicSource) => source === 'shared' ? 'Ortak AGS listesi' : 'Kendi AGS listem'
export function isAgsExam(exam?: { name?: string; base_template_key?: string | null }) {
  return exam?.base_template_key === 'ags' || examTemplateKey(exam?.name || '') === 'ags'
}
export function usesTopicSource(topic: { kind: 'shared' | 'personal'; isAgs?: boolean }, source: AgsTopicSource | null) {
  return topic.kind === 'shared' ? source === 'shared' : !topic.isAgs || source === 'personal'
}
export function agsTopicSourceError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205', 'AGS_SOURCE_SETUP'].includes(code)) return 'AGS liste seçimi için Supabase’de ags_topic_source.sql dosyasını çalıştırın.'
  if (code === '42501') return 'Bu hesabın AGS liste tercihini değiştirme iznin bulunmuyor.'
  return 'AGS liste tercihi yüklenemedi veya kaydedilemedi. Tekrar deneyebilirsin.'
}
export async function readAgsTopicSource(client: SupabaseClient, userId: string): Promise<AgsTopicSource | null> {
  if (!userId) throw new Error('Hesap bulunamadı.')
  const { data, error } = await client.from('ags_topic_preferences').select('source').eq('user_id', userId).maybeSingle()
  if (error) throw Object.assign(new Error(agsTopicSourceError(error)), { code: ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(error.code) ? 'AGS_SOURCE_SETUP' : 'AGS_SOURCE_READ' })
  if (!data) return null
  if (data.source !== 'shared' && data.source !== 'personal') throw new Error('AGS liste tercihi doğrulanamadı.')
  return data.source
}
