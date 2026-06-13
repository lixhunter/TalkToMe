import { useCallback, useEffect, useRef, useState } from 'react'
import { playAudio } from './audio/playAudio'
import { GuideAvatar } from './components/GuideAvatar'
import { askAgent } from './services/agentService'
import { requestTtsAudio, speakWithBrowser } from './services/ttsService'

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

function App() {
  const [isTalking, setIsTalking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [activeHint, setActiveHint] = useState(initialHint)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const fallbackStopTimerRef = useRef<number | null>(null)

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

  const handleMicClick = () => {
    requestIdRef.current += 1
    window.speechSynthesis?.cancel()
    clearFallbackStopTimer()
    setIsTalking(false)
    setIsLoading(false)
    setActiveQuestionId(null)
    setActiveHint('Sprachsteuerung kommt im naechsten Prototyp.')
  }

  useEffect(() => {
    return () => {
      requestIdRef.current += 1
      clearFallbackStopTimer()
      window.speechSynthesis?.cancel()
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
          <button className="mic-button" type="button" onClick={handleMicClick}>
            <span className="button-icon" aria-hidden="true" />
            Mikrofon
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
