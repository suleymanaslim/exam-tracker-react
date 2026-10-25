export type ExamExportTable = 'exams' | 'exam_question_types' | 'exam_results' | 'exam_result_details' | 'study_sessions'
type Row = Record<string, unknown>
type ReadPage = (table: ExamExportTable, from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>

// Fetch independently of the visible list and Supabase's default row limit.
// The caller scopes every page to the same account and orders it by unique ID.
export async function buildExamResultsExport(readPage: ReadPage, now = new Date()) {
  const readAll = async (table: ExamExportTable) => {
    const rows: Row[] = []
    for (let from = 0; ; from += 500) {
      const { data, error } = await readPage(table, from, from + 499)
      if (error) throw error
      if (!data) throw new Error('Deneme verileri okunamadı.')
      rows.push(...data)
      if (data.length < 500) return rows
    }
  }
  const [exams, question_types, results, result_details, timed_sessions] = await Promise.all([
    readAll('exams'), readAll('exam_question_types'), readAll('exam_results'),
    readAll('exam_result_details'), readAll('study_sessions'),
  ])
  return {
    schema_version: 1,
    exported_at: now.toISOString(),
    exams, question_types, results, result_details, timed_sessions,
  }
}

export function downloadExamResultsJson(data: Awaited<ReturnType<typeof buildExamResultsExport>>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `denemeler_${data.exported_at.replace(/[:.]/g, '-')}.json`
  document.body.appendChild(anchor)
  try { anchor.click() } finally {
    anchor.remove()
    // Allow mobile browsers to start consuming the blob before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
