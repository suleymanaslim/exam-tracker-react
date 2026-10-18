import type { SupabaseClient } from '@supabase/supabase-js'
import type { SharedSubject, SharedTopic, SharedTopicProgress, MonthlyTopic, MonthlyTarget } from './monthlyTopics.ts'

export async function readTopicPages(client: SupabaseClient, table: string, owner?: { field: string; id: string }, order = 'id') {
  const rows: Record<string, unknown>[] = []
  for (let start = 0; ; start += 500) {
    let query = client.from(table).select('*').order(order)
    if (owner) query = query.eq(owner.field, owner.id)
    const { data, error } = await query.range(start, start + 499)
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < 500) return rows
  }
}
export async function fetchSharedTopics(client: SupabaseClient, userId: string) {
  const [subjects, topics, progress] = await Promise.all([
    readTopicPages(client, 'ags_shared_subjects'), readTopicPages(client, 'ags_shared_topics'),
    readTopicPages(client, 'ags_topic_progress', { field: 'user_id', id: userId }, 'topic_id'),
  ])
  return { subjects: (subjects as unknown as SharedSubject[]).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'tr')),
    topics: (topics as unknown as SharedTopic[]).sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'tr')),
    progress: progress as unknown as SharedTopicProgress[] }
}
export async function fetchMonthlyData(client: SupabaseClient, ownerId: string) {
  const [shared, personal, subjects, exams, targets] = await Promise.all([
    fetchSharedTopics(client, ownerId), readTopicPages(client, 'topics', { field: 'user_id', id: ownerId }),
    readTopicPages(client, 'subjects', { field: 'user_id', id: ownerId }), readTopicPages(client, 'exams', { field: 'user_id', id: ownerId }),
    readTopicPages(client, 'monthly_topic_targets', { field: 'owner_id', id: ownerId }),
  ])
  const topics: MonthlyTopic[] = [
    ...shared.topics.map(topic => ({ key: `shared:${topic.id}`, id: topic.id, kind: 'shared' as const,
      subjectKey: `shared:${topic.subject_id}`, subject: shared.subjects.find(subject => subject.id === topic.subject_id)?.name || 'Ders', exam: 'AGS · Ortak', title: topic.title,
      completed: shared.progress.find(progress => progress.topic_id === topic.id)?.is_completed === true, archived: !!topic.archived_at })),
    ...personal.map(topic => {
      const subject = subjects.find(subject => subject.id === topic.subject_id)
      return { key: `personal:${topic.id}`, id: String(topic.id), kind: 'personal' as const, subjectKey: `personal:${topic.subject_id}`,
        subject: String(subject?.name || 'Ders kaldırıldı'), exam: String(exams.find(exam => exam.id === subject?.exam_id)?.name || 'Kişisel'),
        title: String(topic.title), completed: topic.is_completed === true, archived: false }
    }),
  ]
  return { topics, targets: targets as unknown as MonthlyTarget[] }
}
