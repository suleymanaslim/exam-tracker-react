import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Shuffle, ExternalLink } from 'lucide-react'
import { nextFocusVideo } from '../lib/playlist'

export default function FocusReset({ onOpen }: { onOpen: () => void }) {
  const [videoId, setVideoId] = useState<string | null>(null)
  const previousVideo = useRef<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const chooseVideo = () => {
    const next = nextFocusVideo(previousVideo.current)
    previousVideo.current = next
    setVideoId(next)
  }
  const close = () => {
    dialog.current?.close()
    setVideoId(null)
    trigger.current?.focus()
  }
  useEffect(() => {
    if (videoId && dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [videoId])
  return <>
    <button ref={trigger} className="study-button study-button-secondary study-focus-reset" onClick={() => { onOpen(); chooseVideo() }}><Sparkles size={17} /> Odağımı toparla</button>
    <dialog ref={dialog} className="study-reset-dialog" aria-labelledby="focus-reset-title" onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === event.currentTarget) close() }}>
      <div className="study-reset-heading"><div><h2 id="focus-reset-title">Bir gülümseme molası</h2></div><button className="study-icon-button" onClick={close} aria-label="Videoyu kapat"><X size={18} /></button></div>
      {videoId && <iframe key={videoId} src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`} title="Odağımı toparla videosu" className="study-reset-video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />}
      <div className="study-reset-actions"><button className="study-button study-button-secondary" onClick={chooseVideo}><Shuffle size={16} /> Başka video</button>{videoId && <a href={`https://www.youtube.com/shorts/${videoId}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> YouTube’da aç</a>}</div>
    </dialog>
  </>
}
