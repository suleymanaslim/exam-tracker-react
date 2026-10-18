import { actualProfileName, profileNameLabel } from './profileName.ts'

export interface CommunityPreferences { user_id: string; show_widget: boolean; share_statistics: boolean }
export interface CommunityEntry { user_id: string; name: string; message: string; total: number; details: Record<string, number> }
export interface CommunityBoard { show_widget: boolean; share_statistics: boolean; daily_message: string; entries: CommunityEntry[] }

export function communityPreferences(value: unknown): CommunityPreferences {
  if (!value || typeof value !== 'object' || !('user_id' in value) || typeof value.user_id !== 'string'
    || !('show_widget' in value) || typeof value.show_widget !== 'boolean'
    || !('share_statistics' in value) || typeof value.share_statistics !== 'boolean') {
    throw new Error('Görünürlük ayarları doğrulanamadı.')
  }
  return { user_id: value.user_id, show_widget: value.show_widget, share_statistics: value.share_statistics }
}

export function communityBoard(value: unknown, ownId: string, metadataName?: string | null): CommunityBoard {
  if (!value || typeof value !== 'object' || !('show_widget' in value) || typeof value.show_widget !== 'boolean'
    || !('share_statistics' in value) || typeof value.share_statistics !== 'boolean'
    || !('entries' in value) || !Array.isArray(value.entries)) throw new Error('Çalışma sıralaması doğrulanamadı.')
  const dailyMessage = 'daily_message' in value && typeof value.daily_message === 'string' ? value.daily_message : ''
  // Never render even a stale/malformed participant list for a hidden widget.
  const entries: CommunityEntry[] = value.show_widget ? value.entries.map(entry => {
    if (!entry || typeof entry.user_id !== 'string' || typeof entry.total !== 'number' || !Number.isFinite(entry.total)
      || entry.total < 0 || !entry.details || typeof entry.details !== 'object' || Array.isArray(entry.details)) throw new Error('Çalışma sıralaması doğrulanamadı.')
    const details = Object.fromEntries(Object.entries(entry.details).map(([label, minutes]) => {
      if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) throw new Error('Çalışma sıralaması doğrulanamadı.')
      return [label, minutes]
    }))
    return {
      user_id: entry.user_id,
      name: actualProfileName(entry.display_name, entry.user_id === ownId ? metadataName : null) || profileNameLabel(null, entry.email),
      message: typeof entry.message === 'string' ? entry.message : '', total: entry.total, details,
    }
  }) : []
  return { show_widget: value.show_widget, share_statistics: value.share_statistics, daily_message: dailyMessage, entries }
}

export function communitySettingsError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  if (['PGRST202', 'PGRST205', '42P01', '42703'].includes(String(code))) return 'Görünürlük ayarlarını etkinleştirmek için Supabase’de community_visibility.sql dosyasını çalıştırıp sayfayı yenileyin.'
  if (code === '42501') return 'Bu ayarları yalnızca yönetici hesabı değiştirebilir.'
  return 'Görünürlük ayarları kaydedilemedi. Bağlantını kontrol edip tekrar dene.'
}
