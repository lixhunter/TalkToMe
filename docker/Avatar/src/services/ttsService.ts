type BrowserSpeechHooks = {
  onStart?: () => void
  onEnd?: () => void
}

export async function requestTtsAudio(text: string) {
  try {
    const response = await fetch('/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })

    if (!response.ok) {
      throw new Error(`TTS request failed with ${response.status}`)
    }

    return await response.blob()
  } catch {
    return null
  }
}

export async function speakWithBrowser(text: string, hooks: BrowserSpeechHooks = {}) {
  if (!('speechSynthesis' in window)) {
    hooks.onStart?.()
    await waitForEstimatedSpeech(text)
    hooks.onEnd?.()
    return
  }

  await new Promise<void>((resolve) => {
    window.speechSynthesis.cancel()
    let didStart = false

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'de-DE'
    utterance.rate = 0.94
    utterance.pitch = 1.04
    utterance.onstart = () => {
      didStart = true
      hooks.onStart?.()
    }
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()

    const fallbackTimer = window.setTimeout(resolve, estimateSpeechDuration(text) + 1000)
    utterance.onend = () => {
      window.clearTimeout(fallbackTimer)
      resolve()
    }
    utterance.onerror = () => {
      window.clearTimeout(fallbackTimer)
      resolve()
    }

    window.setTimeout(() => {
      if (!didStart) {
        didStart = true
        hooks.onStart?.()
      }
    }, 120)

    window.speechSynthesis.speak(utterance)
  }).finally(() => {
    hooks.onEnd?.()
  })
}

function estimateSpeechDuration(text: string) {
  return Math.min(9200, Math.max(2400, text.length * 48))
}

function waitForEstimatedSpeech(text: string) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, estimateSpeechDuration(text))
  })
}
