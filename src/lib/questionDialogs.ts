import Swal from 'sweetalert2'
import { QUESTION_PRESETS, questionCount, questionAnswers, solvedQuestionPresets } from './questionPlan'

export function questionInputOptions(initial = '', allowZero = false, presets: readonly number[] = QUESTION_PRESETS) {
  return {
    html: `<div class="question-dialog-presets" role="group" aria-label="Soru sayısı">${presets.map(count => `<button type="button" data-questions="${count}">${count}</button>`).join('')}</div>`,
    input: 'number' as const,
    inputLabel: 'Soru sayısı', inputValue: initial,
    inputAttributes: { min: allowZero ? '0' : '1', max: '100000', step: '1', inputmode: 'numeric' },
    didOpen: () => {
      Swal.getPopup()?.querySelectorAll<HTMLButtonElement>('[data-questions]').forEach(button => {
        button.addEventListener('click', () => {
          const input = Swal.getInput()
          if (input) { input.value = button.dataset.questions || ''; input.focus() }
        })
      })
    },
    inputValidator: (value: string) => questionCount(value, allowZero) === null ? 'Geçerli bir tam sayı girin.' : undefined,
  }
}

export function questionCompletionOptions(initial = '', correct?: number | null, wrong?: number | null, locked = false, target?: number | null) {
  const options = questionInputOptions(initial, true, solvedQuestionPresets(target))
  return { ...options, didOpen: () => {
    options.didOpen()
    const popup = Swal.getPopup()
    const correctInput = popup?.querySelector<HTMLInputElement>('#question-correct')
    const wrongInput = popup?.querySelector<HTMLInputElement>('#question-wrong')
    if (correctInput && correct != null) correctInput.value = String(correct)
    if (wrongInput && wrong != null) wrongInput.value = String(wrong)
    if (correct != null || wrong != null) popup?.querySelector('details')?.setAttribute('open', '')
    if (locked) lockQuestionInputs()
  }, html: options.html + '<details class="question-dialog-answers"><summary>Doğru / yanlış (isteğe bağlı)</summary><div><label>Doğru<input id="question-correct" type="number" min="0" max="100000" step="1" inputmode="numeric" placeholder="—"></label><label>Yanlış<input id="question-wrong" type="number" min="0" max="100000" step="1" inputmode="numeric" placeholder="—"></label></div></details>' }
}
export function readQuestionAnswers(value: unknown) {
  const popup = Swal.getPopup()
  const answers = questionAnswers(value,
    popup?.querySelector<HTMLInputElement>('#question-correct')?.value || '',
    popup?.querySelector<HTMLInputElement>('#question-wrong')?.value || '')
  if (!answers) Swal.showValidationMessage('Doğru ve yanlış sayıları toplam soru sayısını aşamaz; geçerli tam sayılar girin.')
  return answers
}

export function lockQuestionInputs() {
  const popup = Swal.getPopup()
  const input = Swal.getInput()
  if (input) input.readOnly = true
  popup?.querySelectorAll<HTMLInputElement>('#question-correct, #question-wrong').forEach(field => { field.readOnly = true })
  popup?.querySelectorAll<HTMLButtonElement>('[data-questions]').forEach(button => { button.disabled = true })
}
