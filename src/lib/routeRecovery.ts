/** Retry a stale deployment once. Offline errors and blocked storage never loop. */
export function shouldRefreshRoute(error: unknown, storage: Pick<Storage, 'getItem' | 'setItem'>, build: string, online: boolean) {
  if (!online || !(error instanceof Error) || !/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|Unable to preload CSS|error loading dynamically imported module/i.test(error.message)) return false
  try {
    const key = `studytracker:route-retry:${build}`
    if (storage.getItem(key)) return false
    storage.setItem(key, '1')
    return true
  } catch { return false }
}
