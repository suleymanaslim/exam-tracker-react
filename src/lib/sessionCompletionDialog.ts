import Swal from 'sweetalert2'
import type { SweetAlertOptions } from 'sweetalert2'

/** Keep session actions consistent without replacing the question form's hooks. */
export function sessionCompletionDialog(options: SweetAlertOptions, canContinue: () => boolean = () => true): SweetAlertOptions {
  return {
    ...options,
    customClass: { popup: 'study-save-dialog study-session-dialog', actions: 'study-session-actions', denyButton: 'study-session-forget' },
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: 'Kaydet ve bitir',
    cancelButtonText: 'Çalışmaya devam et',
    denyButtonText: 'Oturumu unut',
    allowOutsideClick: false,
    allowEscapeKey: () => !Swal.isLoading(),
    didOpen: popup => {
      options.didOpen?.(popup)
      const help = document.createElement('details')
      help.className = 'study-session-help'
      const trigger = document.createElement('summary')
      trigger.textContent = '?'
      trigger.setAttribute('aria-label', 'Oturum seçenekleri')
      trigger.title = 'Oturum seçenekleri'
      trigger.addEventListener('click', event => { if (Swal.isLoading()) event.preventDefault() })
      const menu = document.createElement('div')
      menu.className = 'study-session-help-menu'
      const forget = document.createElement('button')
      forget.type = 'button'
      forget.textContent = 'Oturumu unut'
      forget.addEventListener('click', () => { if (!Swal.isLoading()) Swal.clickDeny() })
      menu.append(forget)
      help.append(trigger, menu)
      popup.append(help)
      help.addEventListener('keydown', event => {
        if (event.key === 'Escape' && help.open) {
          event.stopPropagation()
          help.open = false
          trigger.focus()
        }
      })
      popup.addEventListener('click', event => { if (!help.contains(event.target as Node)) help.open = false })
      Swal.getCancelButton()?.addEventListener('click', event => {
        if (!canContinue()) {
          event.preventDefault()
          event.stopImmediatePropagation()
          Swal.showValidationMessage('Bu oturum önce kaydedilmeli. Kaydetmeyi dene veya ? menüsünden oturumu unut.')
        }
      }, { capture: true })
    },
  }
}
