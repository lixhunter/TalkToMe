type AudioPlaybackHooks = {
  onStart?: () => void
  onEnd?: () => void
}

export async function playAudio(audioBlob: Blob, hooks: AudioPlaybackHooks = {}) {
  const audioUrl = URL.createObjectURL(audioBlob)
  const audio = new Audio(audioUrl)

  try {
    await new Promise<void>((resolve, reject) => {
      audio.onplay = () => hooks.onStart?.()
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('Audio playback failed'))

      audio.play().catch(reject)
    })
  } finally {
    hooks.onEnd?.()
    URL.revokeObjectURL(audioUrl)
  }
}
