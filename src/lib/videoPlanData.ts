import type { SupabaseClient } from '@supabase/supabase-js'
import type { VideoWatchState } from './videoWatch'

/** Read older unfinished videos too, beyond the default server row limit. */
export async function fetchVideoPlanItems(client: SupabaseClient, userId: string) {
  const rows: (VideoWatchState & { resource_id: string; sort_order?: number })[] = []
  for (let start = 0; ; start += 500) {
    const { data, error } = await client.from('video_plan_items').select('*').eq('user_id', userId).order('id').range(start, start + 499)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 500) return { data: rows, error: null }
  }
}
