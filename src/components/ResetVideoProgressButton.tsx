import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import Swal from 'sweetalert2'
import { supabase } from '../lib/supabase'
import { resetVideoProgress, videoProgressResetError } from '../lib/videoProgressReset'
import './ResetVideoProgressButton.css'

interface Props {
  userId: string; resourceId: string; resourceName: string;
  disabled?: boolean; onReset?: () => void
}

export default function ResetVideoProgressButton({ userId, resourceId, resourceName, disabled, onReset }: Props) {
  const [busy, setBusy] = useState(false)
  const opening = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const reset = async () => {
    if (opening.current || disabled || !userId || !resourceId) return
    opening.current = true; setBusy(true)
    try {
      const result = await Swal.fire({
        title: 'İzlenme sayısını sıfırlamak istediğine emin misin?',
        text: `${resourceName} kaynağının düzenlenebilir izleme ilerlemesi sıfırlanacak. Pazartesiye kaydedilmiş tamamlanan videolar korunur; onları yalnızca kaydın sil düğmesiyle kaldırabilirsin. Planlar ve çalışma süreleri korunacak.`,
        icon: 'warning', width: 420, showCancelButton: true,
        confirmButtonText: 'Evet, sıfırla', cancelButtonText: 'Vazgeç', confirmButtonColor: '#b6454e',
        showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(), allowEscapeKey: () => !Swal.isLoading(),
        preConfirm: async () => {
          if (!mounted.current) { Swal.close(); return false }
          try { await resetVideoProgress(supabase, userId, resourceId); return true }
          catch (error) {
            console.error('Video progress reset failed:', error)
            Swal.showValidationMessage(videoProgressResetError(error))
            return false
          }
        },
      })
      if (result.isConfirmed && mounted.current) {
        onReset?.()
        void Swal.fire({ icon: 'success', title: 'İzlenme sayacı sıfırlandı', toast: true, position: 'top-end', showConfirmButton: false, timer: 1800 })
      }
    } finally { opening.current = false; if (mounted.current) setBusy(false) }
  }
  return <button type="button" className="video-progress-reset-button" disabled={disabled || busy} onClick={event => { event.stopPropagation(); void reset() }} aria-label={`${resourceName} için izlenen video sayısını sıfırla`}><RotateCcw size={13} aria-hidden="true" />{busy ? 'Sıfırlanıyor…' : 'İzleneni sıfırla'}</button>
}
