// Speech-to-Text Aufnahme: Mikrofon -> VAD -> /transcribe (whisper) -> n8n.
// Portiert aus docker/SpeechToText/frontend/index.html. Reine Logik, kein UI.

const STT_URL = '/transcribe'
const N8N_URL = 'http://192.168.2.185:5678/webhook/stt'
const THRESHOLD = 0.015 // RMS Lautstaerke-Schwelle
const SILENCE_MS = 1200 // Stille -> Aufnahme stoppen

export type SttHooks = {
  onStatus?: (status: string) => void
  onTranscript?: (text: string) => void
  onError?: (message: string) => void
}

let stream: MediaStream | null = null
let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let mediaRecorder: MediaRecorder | null = null
let active = false
let recording = false
let silenceTimer: number | null = null
let chunks: Blob[] = []
let hooks: SttHooks = {}

export function isListening() {
  return active
}

export async function startListening(nextHooks: SttHooks = {}) {
  if (active) return
  hooks = nextHooks
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    audioCtx = new AudioContext()
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    audioCtx.createMediaStreamSource(stream).connect(analyser)
    active = true
    hooks.onStatus?.('Hört zu...')
    detectVoice()
  } catch (e) {
    hooks.onError?.('Mikrofon-Fehler: ' + (e instanceof Error ? e.message : String(e)))
  }
}

export function stopListening() {
  active = false
  if (silenceTimer) {
    window.clearTimeout(silenceTimer)
    silenceTimer = null
  }
  if (recording && mediaRecorder?.state === 'recording') mediaRecorder.stop()
  stream?.getTracks().forEach((t) => t.stop())
  void audioCtx?.close()
  stream = null
  audioCtx = null
  analyser = null
  recording = false
  hooks.onStatus?.('Bereit')
}

function detectVoice() {
  if (!active || !analyser) return
  const data = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(data)
  const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length)

  if (rms > THRESHOLD) {
    if (!recording) startRecording()
    if (silenceTimer) window.clearTimeout(silenceTimer)
    silenceTimer = window.setTimeout(stopRecording, SILENCE_MS)
  }

  requestAnimationFrame(detectVoice)
}

function startRecording() {
  if (!stream) return
  recording = true
  chunks = []
  mediaRecorder = new MediaRecorder(stream)
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  mediaRecorder.onstop = sendAudio
  mediaRecorder.start(100)
  hooks.onStatus?.('Aufnahme läuft...')
}

function stopRecording() {
  if (!recording) return
  recording = false
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop()
  hooks.onStatus?.('Verarbeite...')
}

async function sendAudio() {
  if (chunks.length === 0) {
    if (active) hooks.onStatus?.('Hört zu...')
    return
  }

  const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
  const form = new FormData()
  form.append('audio', blob, 'audio.webm')

  try {
    const res = await fetch(STT_URL, { method: 'POST', body: form })
    const data = await res.json()
    const text = (data.text as string) || ''
    if (text) {
      hooks.onTranscript?.(text)
      void sendToN8n(text)
    }
  } catch (e) {
    hooks.onError?.('STT-Fehler: ' + (e instanceof Error ? e.message : String(e)))
  }

  if (active) hooks.onStatus?.('Hört zu...')
}

async function sendToN8n(text: string) {
  // Eigener try: Webhook-Fehler darf Transkription nicht ueberschreiben.
  try {
    await fetch(N8N_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch (e) {
    console.error('n8n-Webhook fehlgeschlagen:', e)
  }
}
