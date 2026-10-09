export type SessionMode = 'pomodoro_long' | 'pomodoro_short' | 'manual' | 'stopwatch' | 'questions'
export type SelectionSource = 'plan' | 'free'

export interface Exam { id: string; name: string; color: string }
export interface Subject { id: string; exam_id: string; name: string }
export interface Resource { id: string; subject_id: string; name: string; resource_type: string; url: string | null; total_videos?: number | null }
export interface PomodoroSettings {
  long_focus_minutes: number
  long_break_minutes: number
  short_focus_minutes: number
  short_break_minutes: number
}
export interface PlanItem {
  id: string
  subject_id: string | null
  resource_id: string | null
  title: string | null
  planned_minutes: number
  video_count?: number
}
export interface TaskRow {
  id: string
  name: string
  detail: string
  todayMinutes: number
  kind: 'video' | 'study' | 'questions'
  done: boolean
  disabled: boolean
}
