import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgsTopicSource } from './agsTopicSource.ts'
import type { MonthlyTarget, MonthlyTopic } from './monthlyTopics.ts'

export interface MonthlyPlanAccess { plan_owner_id: string; owner_name: string; can_edit: boolean }
export interface SharedMonthlyPlan { owner_id: string; agsTopicSource: AgsTopicSource | null; topics: MonthlyTopic[]; targets: MonthlyTarget[] }
export const monthlyAccessEvent = 'monthly-plan-access-changed'
export const monthlyAccessStorage = 'examtracker-monthly-access-updated'

export function monthlyPlanAccessError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code)) return 'Aylık plan paylaşımı için Supabase’de monthly_plan_sharing.sql dosyasını çalıştırın.'
  if (code === '42501') return 'Bu aylık planı görüntüleme iznin bulunmuyor veya iznin kaldırılmış.'
  return 'Aylık plan erişimi yüklenemedi veya güncellenemedi. Tekrar deneyebilirsin.'
}
export async function fetchMonthlyPlanAccess(client: SupabaseClient): Promise<MonthlyPlanAccess[]> {
  const { data, error } = await client.rpc('get_accessible_monthly_plans')
  if (error) throw error
  if (!Array.isArray(data) || data.some(row => !row || typeof row.plan_owner_id !== 'string' || typeof row.owner_name !== 'string' || typeof row.can_edit !== 'boolean')) throw new Error('Plan erişimi doğrulanamadı.')
  return data
}
export async function fetchSharedMonthlyPlan(client: SupabaseClient, ownerId: string): Promise<SharedMonthlyPlan> {
  const { data, error } = await client.rpc('get_shared_monthly_plan', { p_owner_id: ownerId })
  if (error) throw error
  if (!data || data.owner_id !== ownerId || !Array.isArray(data.topics) || !Array.isArray(data.targets)
    || ![null, 'shared', 'personal'].includes(data.agsTopicSource)
    || data.targets.some((target: MonthlyTarget) => target.owner_id !== ownerId)) throw new Error('Paylaşılan plan doğrulanamadı.')
  return data
}
export function notifyMonthlyPlanAccessChanged() {
  window.dispatchEvent(new Event(monthlyAccessEvent))
  try { localStorage.setItem(monthlyAccessStorage, String(Date.now())) } catch { /* Refreshed again on window focus. */ }
}
