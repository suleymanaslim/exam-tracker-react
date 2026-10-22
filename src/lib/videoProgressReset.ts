import type { SupabaseClient } from '@supabase/supabase-js'

/** Only watch-state fields are reset, scoped to one owner's single resource. */
export async function resetVideoProgress(client: SupabaseClient, userId: string, resourceId: string) {
  if (!userId || !resourceId) throw new Error('Reset target is required')
  const { error } = await client.rpc('reset_video_watch_progress', { p_user_id: userId, p_resource_id: resourceId })
  if (error) throw error
  // A denied RLS update can affect zero rows without an error. Verify the result
  // using an exact HEAD count, which also avoids the normal response row limit.
  const check = await client.from('video_plan_items').select('id', { head: true, count: 'exact' })
    .eq('user_id', userId).eq('resource_id', resourceId)
    .is('completion_week', null)
    .or('watched_count.gt.0,is_completed.eq.true,watch_parts_done.gt.0')
  if (check.error) throw check.error
  if (check.count !== 0) throw new Error('Reset could not be verified')
}

export function videoProgressResetError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  if (code === '42501') return 'Bu kaynağın video planını düzenleme izni yok. Hesabını veya yönetici izinlerini kontrol et.'
  return 'İzlenme sayısı sıfırlanamadı veya doğrulanamadı. Lütfen tekrar dene.'
}
