import type { SupabaseClient } from '@supabase/supabase-js'
import { localDayKey, mondayOf } from './statsPeriod.ts'

export function weeklyPlanDateKeys(day: Date): string[] {
  const monday = mondayOf(day)
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() - 1)
  // Older Plan versions saved local Monday midnight as the previous UTC Sunday.
  return [localDayKey(monday), localDayKey(sunday)]
}
export function findWeeklyPlans(client: SupabaseClient, userId: string, day: Date) {
  return client.from('weekly_plans').select('id,week_start_date')
    .eq('user_id', userId).in('week_start_date', weeklyPlanDateKeys(day))
    .order('week_start_date', { ascending: false })
}
