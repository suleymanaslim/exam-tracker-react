import { supabase } from './supabase'

export interface AdhdTask {
  id: string
  user_id: string
  task_date: string
  subject_id: string
  note: string | null
  sort_order: number
  studied_seconds: number
  completed_at: string | null
  subjects?: { name: string } | null
}

export interface RunningAdhdTimer { taskId: string; sessionId: string; startedAt: string }

export const ADHD_CHANGED_EVENT = 'adhd-mode-changed'
/** Bir dersin "yapıldı" sayılması için gereken süre. */
export const ADHD_DONE_SECONDS = 60
const TASK_FIELDS = 'id,user_id,task_date,subject_id,note,sort_order,studied_seconds,completed_at,subjects(name)'

export function adhdError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)) return 'DEHB modu için Supabase’de adhd_mode.sql dosyasını çalıştırın.'
  if (code === '42501') return 'Bu işlem için iznin yok.'
  return 'Bağlantı kurulamadı. Tekrar dener misin?'
}

export function notifyAdhdChanged() {
  window.dispatchEvent(new Event(ADHD_CHANGED_EVENT))
}

export async function readAdhdEnabled(userId: string) {
  const { data, error } = await supabase.from('adhd_mode_settings').select('enabled').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data?.enabled === true
}

export async function readAdhdSettings() {
  const { data, error } = await supabase.from('adhd_mode_settings').select('user_id,enabled')
  if (error) throw error
  return Object.fromEntries((data || []).map(row => [row.user_id as string, row.enabled === true])) as Record<string, boolean>
}

export async function setAdhdEnabled(userId: string, enabled: boolean) {
  const { error } = await supabase.from('adhd_mode_settings').upsert({ user_id: userId, enabled, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
  notifyAdhdChanged()
}

export async function readAdhdTasks(userId: string, day: string): Promise<AdhdTask[]> {
  const { data, error } = await supabase.from('adhd_daily_tasks').select(TASK_FIELDS)
    .eq('user_id', userId).eq('task_date', day).order('sort_order').order('created_at')
  if (error) throw error
  return (data || []) as unknown as AdhdTask[]
}

export async function addAdhdTask(userId: string, day: string, subjectId: string, note: string, sortOrder: number) {
  const { error } = await supabase.from('adhd_daily_tasks').insert({ user_id: userId, task_date: day, subject_id: subjectId, note: note.trim() || null, sort_order: sortOrder })
  if (error) throw error
  notifyAdhdChanged()
}

export async function deleteAdhdTask(id: string) {
  const { error } = await supabase.from('adhd_daily_tasks').delete().eq('id', id)
  if (error) throw error
  notifyAdhdChanged()
}

export async function moveAdhdTask(tasks: AdhdTask[], index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= tasks.length) return
  const reordered = [...tasks]
  ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
  const results = await Promise.all(reordered.map((task, order) => supabase.from('adhd_daily_tasks').update({ sort_order: order }).eq('id', task.id)))
  const failed = results.find(result => result.error)
  if (failed?.error) throw failed.error
  notifyAdhdChanged()
}

export async function copyAdhdTasks(userId: string, fromDay: string, toDay: string) {
  const [source, existing] = await Promise.all([readAdhdTasks(userId, fromDay), readAdhdTasks(userId, toDay)])
  if (!source.length) return 0
  const { error } = await supabase.from('adhd_daily_tasks').insert(source.map((task, index) => ({
    user_id: userId, task_date: toDay, subject_id: task.subject_id, note: task.note, sort_order: existing.length + index,
  })))
  if (error) throw error
  notifyAdhdChanged()
  return source.length
}

export async function recordAdhdStudy(timer: RunningAdhdTimer, endedAt: Date) {
  const { data, error } = await supabase.rpc('record_adhd_task_study', {
    p_task_id: timer.taskId, p_session_id: timer.sessionId, p_started_at: timer.startedAt, p_ended_at: endedAt.toISOString(),
  })
  if (error) throw error
  window.dispatchEvent(new Event('study-session-saved'))
  return data as AdhdTask
}

// Kronometre sekme kapansa bile devam etsin diye başlangıç zamanı cihazda tutulur.
const timerKey = (userId: string) => `adhd-timer:${userId}`
export function loadRunningTimer(userId: string): RunningAdhdTimer | null {
  try {
    const value = JSON.parse(localStorage.getItem(timerKey(userId)) || 'null')
    return value && typeof value.taskId === 'string' && typeof value.sessionId === 'string' && !Number.isNaN(Date.parse(value.startedAt)) ? value : null
  } catch { return null }
}
export function storeRunningTimer(userId: string, timer: RunningAdhdTimer | null) {
  try {
    if (timer) localStorage.setItem(timerKey(userId), JSON.stringify(timer))
    else localStorage.removeItem(timerKey(userId))
  } catch { /* Depolama kapalıysa kronometre yalnızca bu sekmede çalışır. */ }
}

export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function minutesLabel(seconds: number, verb = 'çalıştın') {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 1) return seconds > 0 ? `1 dakikadan az ${verb}` : 'Henüz başlanmadı'
  if (minutes < 60) return `${minutes} dk ${verb}`
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk ${verb}`
}

// ── Haftalık plan, kopyala/yapıştır ve setler ─────────────────────────────
/** Ders adıyla tutulur; böylece başka kullanıcıya veya başka haftaya uygulanabilir. day: 1=Pzt … 7=Paz */
export interface AdhdTemplateItem { day: number; subject_name: string; note: string | null }
export interface AdhdPlanSet { id: string; name: string; items: AdhdTemplateItem[]; created_at: string }

export function setsError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (['42P01', 'PGRST205'].includes(code)) return 'Setler için Supabase’de adhd_plan_sets.sql dosyasını çalıştırın.'
  return adhdError(error)
}

export async function readAdhdWeek(userId: string, monday: string, sunday: string): Promise<AdhdTask[]> {
  const { data, error } = await supabase.from('adhd_daily_tasks').select(TASK_FIELDS)
    .eq('user_id', userId).gte('task_date', monday).lte('task_date', sunday).order('task_date').order('sort_order').order('created_at')
  if (error) throw error
  return (data || []) as unknown as AdhdTask[]
}

export async function insertAdhdTasks(rows: { user_id: string; task_date: string; subject_id: string; note: string | null; sort_order: number }[]) {
  if (!rows.length) return
  const { error } = await supabase.from('adhd_daily_tasks').insert(rows)
  if (error) throw error
  notifyAdhdChanged()
}

export async function deleteAdhdTasks(ids: string[]) {
  if (!ids.length) return
  const { error } = await supabase.from('adhd_daily_tasks').delete().in('id', ids)
  if (error) throw error
  notifyAdhdChanged()
}

export async function readAdhdSets(): Promise<AdhdPlanSet[]> {
  const { data, error } = await supabase.from('adhd_plan_sets').select('id,name,items,created_at').order('created_at')
  if (error) throw error
  return (data || []) as AdhdPlanSet[]
}

export async function saveAdhdSet(name: string, items: AdhdTemplateItem[]) {
  const { error } = await supabase.from('adhd_plan_sets').insert({ name: name.trim(), items })
  if (error) throw error
}

export async function deleteAdhdSet(id: string) {
  const { error } = await supabase.from('adhd_plan_sets').delete().eq('id', id)
  if (error) throw error
}
