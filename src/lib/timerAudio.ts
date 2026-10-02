let timerAudio: HTMLAudioElement | null = null
function audio() {
  if (!timerAudio) {
    timerAudio = new Audio('/audio/timer-alarm.mp3')
    timerAudio.preload = 'auto'
  }
  return timerAudio
}

export function unlockTimerAlarm() {
  const player = audio()
  player.pause()
  player.currentTime = 0
  player.volume = 0
  void player.play().then(() => {
    player.pause()
    player.currentTime = 0
    player.volume = 1
  }).catch(() => { player.volume = 1 })
}
export function playTimerAlarm() {
  const player = audio()
  player.pause()
  player.currentTime = 0
  player.volume = 1
  void player.play().catch(() => {})
}
export function stopTimerAlarm() { timerAudio?.pause() }
