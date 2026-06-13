import { useCallback, useEffect, useRef, useState } from 'react'
import { playAudio } from './audio/playAudio'
import { GuideAvatar } from './components/GuideAvatar'
import { askAgent } from './services/agentService'
import { startListening, stopListening } from './services/sttService'
import { requestTtsAudio, speakWithBrowser } from './services/ttsService'
import { fetchVoiceOutput, requestVoiceOutputAudio } from './services/voiceGenService'

type Question = {
  id: string
  label: string
  answer: string
}

const questions: Question[] = [
  {
    id: 'purpose',
    label: 'Was macht der Verein?',
    answer:
      'Wir bringen Menschen zusammen, die sich fuer unsere gemeinsamen Ziele engagieren. Der Verein organisiert Projekte, Veranstaltungen und Begegnungen, damit Interessierte einfach mitmachen koennen.',
  },
  {
    id: 'join',
    label: 'Wie kann ich mitmachen?',
    answer:
      'Du kannst direkt Kontakt aufnehmen, bei einer Veranstaltung vorbeikommen oder Mitglied werden. Fuer den ersten Schritt reicht es, den QR-Code zu scannen oder hier am Stand nachzufragen.',
  },
  {
    id: 'projects',
    label: 'Welche Projekte gibt es?',
    answer:
      'Der Verein arbeitet an Projekten, die Gemeinschaft, Austausch und praktische Unterstuetzung foerdern. In der finalen Version lese ich diese Informationen direkt aus der Vereinswebseite.',
  },
  {
    id: 'location',
    label: 'Wo finde ich euch?',
    answer:
      'Alle aktuellen Informationen findest du auf der Vereinswebseite. Scanne einfach den QR-Code oder sprich das Team hier am Stand an.',
  },
]

const initialHint = 'Hallo, ich bin der digitale Vereinsguide.'
const voicePollIntervalMs = 2500

function App() {
  const [isTalking, setIsTalking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [activeHint, setActiveHint] = useState(initialHint)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const fallbackStopTimerRef = useRef<number | null>(null)
  const latestVoiceTextRef = useRef('')
  const voicePollBusyRef = useRef(false)

  const clearFallbackStopTimer = useCallback(() => {
    if (fallbackStopTimerRef.current) {
      window.clearTimeout(fallbackStopTimerRef.current)
      fallbackStopTimerRef.current = null
    }
  }, [])

  const stopTalking = useCallback((requestId: number) => {
    if (requestIdRef.current === requestId) {
      clearFallbackStopTimer()
      setIsTalking(false)
      setIsLoading(false)
      setActiveQuestionId(null)
      setActiveHint(initialHint)
    }
  }, [clearFallbackStopTimer])

  const answerQuestion = useCallback(
    async (question: Question) => {
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId

      window.speechSynthesis?.cancel()
      clearFallbackStopTimer()
      setIsTalking(false)
      setIsLoading(true)
      setActiveQuestionId(question.id)
      setActiveHint(question.label)

      const answer = await askAgent(question.label, question.answer)
      if (requestIdRef.current !== requestId) {
        return
      }

      const hooks = {
        onStart: () => {
          if (requestIdRef.current === requestId) {
            setIsTalking(true)
            setIsLoading(false)
          }
        },
        onEnd: () => stopTalking(requestId),
      }

      const ttsAudio = await requestTtsAudio(answer)
      if (requestIdRef.current !== requestId) {
        return
      }

      if (ttsAudio) {
        try {
          await playAudio(ttsAudio, hooks)
          return
        } catch {
          if (requestIdRef.current !== requestId) {
            return
          }
        }
      }

      hooks.onStart()
      fallbackStopTimerRef.current = window.setTimeout(() => {
        window.speechSynthesis?.cancel()
        stopTalking(requestId)
      }, estimateFallbackPlaybackDuration(answer) + 1200)

      void speakWithBrowser(answer)
    },
    [clearFallbackStopTimer, stopTalking],
  )

  const playLatestVoiceOutput = useCallback(
    async (text: string) => {
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId

      window.speechSynthesis?.cancel()
      clearFallbackStopTimer()
      setIsTalking(false)
      setIsLoading(true)
      setActiveQuestionId(null)
      setActiveHint('Neue Voice-Ausgabe erkannt')

      const voiceAudio = await requestVoiceOutputAudio()
      if (requestIdRef.current !== requestId) {
        return false
      }

      if (!voiceAudio) {
        stopTalking(requestId)
        return false
      }

      setIsTalking(true)
      setIsLoading(false)
      setActiveHint(text)

      try {
        await playAudio(voiceAudio, {
          onEnd: () => stopTalking(requestId),
        })
        return true
      } catch {
        if (requestIdRef.current === requestId) {
          stopTalking(requestId)
        }
        return false
      }
    },
    [clearFallbackStopTimer, stopTalking],
  )

  const handleMicClick = () => {
    if (isListening) {
      stopListening()
      setIsListening(false)
      setActiveHint(initialHint)
      return
    }

    requestIdRef.current += 1
    window.speechSynthesis?.cancel()
    clearFallbackStopTimer()
    setIsTalking(false)
    setIsLoading(false)
    setActiveQuestionId(null)
    setIsListening(true)

    void startListening({
      onStatus: (status) => setActiveHint(status),
      onTranscript: (text) => setActiveHint('Du: ' + text),
      onError: (message) => {
        setActiveHint(message)
        setIsListening(false)
      },
    })
  }

  useEffect(() => {
    let cancelled = false

    const pollVoiceOutput = async () => {
      if (cancelled || isLoading || isTalking || voicePollBusyRef.current) {
        return
      }

      voicePollBusyRef.current = true
      try {
        const output = await fetchVoiceOutput()
        if (cancelled) {
          return
        }

        if (!output) {
          return
        }

        const text = output.text.trim()
        if (!text || text === latestVoiceTextRef.current) {
          return
        }

        // Mark text as handled before playback to avoid rapid duplicate retries.
        latestVoiceTextRef.current = text
        const didPlay = await playLatestVoiceOutput(text)
        if (!didPlay && !cancelled) {
          setActiveHint('Audio blocked or unavailable. Click once to enable sound.')
        }
      } finally {
        voicePollBusyRef.current = false
      }
    }

    const intervalId = window.setInterval(() => {
      void pollVoiceOutput()
    }, voicePollIntervalMs)
    void pollVoiceOutput()

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [isLoading, isTalking, playLatestVoiceOutput])

  useEffect(() => {
    return () => {
      requestIdRef.current += 1
      clearFallbackStopTimer()
      window.speechSynthesis?.cancel()
      stopListening()
    }
  }, [clearFallbackStopTimer])

  return (
    <main className="kiosk-shell">
      <header className="topbar" aria-label="Kopfbereich">
        <div>
          <p className="institution">Institut fuer digitale Vereinsarbeit</p>
          <h1>KI-Avatar Vereinsguide</h1>
        </div>
        <div className={`status-pill status-${isTalking ? 'speaking' : 'idle'}`} aria-live="polite">
          <span className="status-dot" />
          {isLoading ? 'Bereite Antwort vor' : isTalking ? 'Spricht' : 'Bereit'}
        </div>
      </header>

      <section className="demo-layout" aria-label="Avatar Demo">
        <div className="avatar-stage">
          <div className="avatar-halo" />
          <div className="avatar-frame">
            <GuideAvatar state={isTalking ? 'speaking' : 'idle'} isTalking={isTalking} />
          </div>
          <div className="state-caption">{activeHint}</div>
        </div>

        <aside className="question-panel" aria-label="Fragen">
          <button
            className="mic-button"
            data-active={isListening}
            type="button"
            onClick={handleMicClick}
          >
            <span className="button-icon" aria-hidden="true" />
            {isListening ? 'Zuhören stoppen' : 'Mikrofon'}
          </button>

          <div className="question-grid">
            {questions.map((question) => (
              <button
                className="question-button"
                data-active={activeQuestionId === question.id}
                disabled={isLoading || isTalking}
                key={question.id}
                type="button"
                onClick={() => void answerQuestion(question)}
              >
                {question.label}
              </button>
            ))}
          </div>
        </aside>
      </section>

      <footer>Lokaler Prototyp · keine Cloud · Demo-Modus</footer>
    </main>
  )
}

function estimateFallbackPlaybackDuration(text: string) {
  return Math.min(9200, Math.max(2400, text.length * 48))
}

export default App
