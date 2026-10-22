import type { SupabaseClient } from '@supabase/supabase-js'
import type { SharedSubject, SharedTopic, SharedTopicProgress, MonthlyTopic, MonthlyTarget } from './monthlyTopics.ts'
import { isAgsExam, readAgsTopicSource, usesTopicSource } from './agsTopicSource.ts'
import { monthlyTargetKey } from './monthlyTopics.ts'

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
  const source = readAgsTopicSource(client, ownerId)
  const [agsTopicSource, shared, personal, subjects, exams, targets] = await Promise.all([
    source, source.then(value => value === 'shared' ? fetchSharedTopics(client, ownerId) : { subjects: [], topics: [], progress: [] }), readTopicPages(client, 'topics', { field: 'user_id', id: ownerId }),
    readTopicPages(client, 'subjects', { field: 'user_id', id: ownerId }), readTopicPages(client, 'exams', { field: 'user_id', id: ownerId }),
    readTopicPages(client, 'monthly_topic_targets', { field: 'owner_id', id: ownerId }),
  ])
  const sharedSubjects = new Map(shared.subjects.map(subject => [subject.id, subject]))
  const sharedProgress = new Map(shared.progress.map(progress => [progress.topic_id, progress]))
  const subjectById = new Map(subjects.map(subject => [subject.id, subject]))
  const examById = new Map(exams.map(exam => [exam.id, exam]))
  const topics: MonthlyTopic[] = [
    ...shared.topics.map(topic => ({ key: `shared:${topic.id}`, id: topic.id, kind: 'shared' as const,
      subjectKey: `shared:${topic.subject_id}`, subject: sharedSubjects.get(topic.subject_id)?.name || 'Ders', exam: 'AGS · Ortak', title: topic.title,
      completed: sharedProgress.get(topic.id)?.is_completed === true, archived: !!topic.archived_at, isAgs: true })),
    ...personal.map(topic => {
      const subject = subjectById.get(topic.subject_id)
      const exam = examById.get(subject?.exam_id)
      return { key: `personal:${topic.id}`, id: String(topic.id), kind: 'personal' as const, subjectKey: `personal:${topic.subject_id}`,
        subject: String(subject?.name || 'Ders kaldırıldı'), exam: String(exam?.name || 'Kişisel'),
        title: String(topic.title), completed: topic.is_completed === true, archived: false,
        isAgs: isAgsExam(exam as { name?: string; base_template_key?: string | null } | undefined) }
    }),
  ]
  const visibleTopics = topics.filter(topic => usesTopicSource(topic, agsTopicSource))
  const visibleKeys = new Set(visibleTopics.map(topic => topic.key))
  return { topics: visibleTopics, targets: (targets as unknown as MonthlyTarget[]).filter(target => visibleKeys.has(monthlyTargetKey(target))), agsTopicSource }
}
