import { questionNoteSuggestions } from './questionPlan.ts'

interface NoteRecord { note?: string | null; created_at?: string }
export type NoteHistorySource = 'plans' | 'solutions'
type ReadPage = (source: NoteHistorySource, from: number, to: number) => PromiseLike<{ data: NoteRecord[] | null; error: unknown }>

export async function readQuestionNoteHistory(readPage: ReadPage): Promise<string[]> {
  const readAll = async (source: NoteHistorySource) => {
    const rows: NoteRecord[] = []
    for (let from = 0; ; from += 500) {
      const { data, error } = await readPage(source, from, from + 499)
      if (error) throw error
      const page = data || []
      rows.push(...page)
      if (page.length < 500) return rows
    }
  }
  const results = await Promise.allSettled([readAll('plans'), readAll('solutions')])
  // One unavailable source must not hide usable suggestions from the other.
  if (results.every(result => result.status === 'rejected')) throw new Error('Konu geçmişi alınamadı.')
  const rows = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  const timestamp = (value?: string) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0
  rows.sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at))
  return questionNoteSuggestions(rows.map(row => row.note), Number.POSITIVE_INFINITY)
}

export function matchingQuestionNotes(notes: string[], query: string): string[] {
  const term = query.trim().toLocaleLowerCase('tr-TR')
  return term ? notes.filter(note => note.toLocaleLowerCase('tr-TR').includes(term)) : notes
}
