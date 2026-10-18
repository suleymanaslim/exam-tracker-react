export type AnswerCount = number | ''

/** A configured zero means the question count is not known, rather than a zero-question test. */
export function answerLimit(questionCount: number, other: AnswerCount = ''): number {
  return Math.max(0, (questionCount > 0 ? questionCount : 2147483647) - Number(other === '' ? 0 : other))
}

/** Invalid text leaves the input unchanged. Large digit-only pastes are capped at the remaining questions. */
export function readAnswerInput(raw: string, other: AnswerCount, questionCount: number): AnswerCount | null {
  if (raw === '') return ''
  if (!/^\d+$/.test(raw)) return null
  return Math.min(Number(raw), answerLimit(questionCount, other))
}

export function validateAnswers(correct: AnswerCount = '', incorrect: AnswerCount = '', questionCount = 0): string {
  const counts = [correct === '' ? 0 : correct, incorrect === '' ? 0 : incorrect]
  if (!counts.every(n => Number.isSafeInteger(n) && n >= 0)) return 'Sayılar sıfır veya pozitif tam sayı olmalı.'
  if (questionCount > 0 && counts[0] + counts[1] > questionCount) return `Toplam ${questionCount} soruyu geçemez.`
  return ''
}
