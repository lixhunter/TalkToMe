# AI Avatar — CLAUDE.md

## Kommunikation
**Caveman-Modus aktiv für die gesamte Session.** Terse antworten, Füllwörter weg, technische Substanz bleibt. Code/Commits/Security normal schreiben. Level: full.

## Projektziel
Interaktiver KI-Avatar mit Spracheingabe und -ausgabe, gebaut als modulares System.
Orchestrierung via **n8n**. Jede KI-Komponente ist ein eigenständiger FastAPI-Microservice.

---

## Architektur

```
[User: Mikrofon]
      ↓
[STT-Service]          localhost:8001
      ↓  POST /transcribe → { text }
[n8n Workflow]         localhost:5678
      ↓  HTTP Request → LLM
[LLM-Service]          localhost:8002 (Ollama)
      ↓  POST /generate → { response }
[n8n Workflow]
      ↓  HTTP Request → TTS
[TTS-Service]          localhost:8003
      ↓  POST /synthesize → audio/wav
[Avatar Frontend]      localhost:3000
```

Jeder Service ist **zustandslos**. n8n hält den Konversationskontext.

---

## Stack

| Komponente | Technologie | Port |
|---|---|---|
| Orchestrierung | n8n | 5678 |
| STT | whisper.cpp large-v3 (Vulkan/AMD) | 8001 |
| LLM | Ollama (Llama 3 70B 4-bit) | 8002 |
| TTS | Chatterbox / XTTS v2 | 8003 |
| Frontend | HTML/JS oder React | 3000 |

**Hardware:** AMD-GPU, ~46GB VRAM → alle Modelle lokal. **Kein CUDA** → GPU-Pfade ROCm/Vulkan. STT nutzt whisper.cpp Vulkan (CTranslate2/faster-whisper hat keinen AMD-Support).
**Sprache:** Deutsch (Primär), Englisch (Fallback für TTS falls Qualität unzureichend)

---

## Modulstruktur

```
ai-avatar/
├── CLAUDE.md
├── docker-compose.yml        # Optionales Compose für alle Services
├── stt-service/
│   ├── main.py               # FastAPI App
│   ├── requirements.txt
│   └── README.md
├── tts-service/
│   ├── main.py
│   ├── requirements.txt
│   └── README.md
├── n8n-workflows/
│   └── avatar_workflow.json  # Exportierter n8n Workflow
└── frontend/
    └── index.html            # Push-to-Talk UI
```

---

## Service-Contracts (API)

### STT-Service — POST /transcribe
```
Input:  multipart/form-data  { audio: <wav/webm file> }
Output: application/json     { "text": "Transkribierter Text", "language": "de" }
```

### TTS-Service — POST /synthesize
```
Input:  application/json     { "text": "Text zum Vorlesen", "language": "de" }
Output: audio/wav            (raw audio bytes)
```

### LLM via Ollama — POST /api/chat
```
Input:  application/json     { "model": "llama3:70b", "messages": [...] }
Output: application/json     { "message": { "content": "..." } }
```

---

## Entwicklungsprinzipien

### Hackathon-Modus (Priorität: Geschwindigkeit)
- **Push-to-Talk zuerst** — kein Live-VAD im MVP. User-seitige VAD erst wenn Zeit bleibt
- **Kein Authentication, kein Rate Limiting** — Demo-Kontext, localhost only
- **Fehler loggen, nicht behandeln** — `try/except` nur wo absolut nötig
- **Hardcoded Config** — keine .env-Komplexität, Konstanten direkt in `main.py`

### Code-Stil
- Python 3.11+
- FastAPI für alle Services (async wo sinnvoll)
- Keine abstrakten Klassen, keine Overengineering — flache Funktionsstruktur
- Ein Service = eine `main.py` + `requirements.txt`

### Latenz-Optimierung
- Modelle beim Service-Start laden (`@app.on_event("startup")`) — nicht per Request
- TTS: erst senden wenn vollständig generiert (Streaming erst wenn Zeit bleibt)
- LLM-Kontext in n8n als JSON Array halten, nicht im Service

---

## Bekannte Constraints

- **TTS Deutsch:** Chatterbox bevorzugt. XTTS v2 als Fallback. Kein ElevenLabs / OpenAI TTS (closed source out of scope)
- **GPU-Geschwindigkeit:** Modelle nicht parallel auf GPU laden wenn VRAM knapp wird — sequenziell testen
- **n8n Webhooks:** Timeouts beachten — Standard ist 120s, bei langsamer GPU ggf. erhöhen
- **Audio-Format:** Frontend schickt WebM (Browser-Standard) → STT-Service konvertiert via ffmpeg zu WAV

---

## MVP-Checkliste

- [ ] STT-Service läuft, `/transcribe` gibt Text zurück
- [ ] Ollama läuft mit Llama 3 70B, `/api/chat` antwortet
- [ ] TTS-Service läuft, `/synthesize` gibt Audio zurück
- [ ] n8n Workflow verbindet alle drei Services
- [ ] Frontend: Mikrofon-Button → Audio aufnehmen → Pipeline triggern → Audio abspielen
- [ ] End-to-End Demo: Frage stellen, Avatar antwortet

---

## Quick Start

```bash
# STT-Service
cd stt-service && pip install -r requirements.txt && uvicorn main:app --port 8001

# LLM (Ollama)
ollama serve
ollama pull llama3:70b

# TTS-Service
cd tts-service && pip install -r requirements.txt && uvicorn main:app --port 8003

# n8n
npx n8n
```

---

## Nächste Schritte (Post-MVP falls Zeit bleibt)
1. Silero VAD clientseitig → echtes Live-Gespräch ohne Push-to-Talk
2. LLM-Streaming → TTS startet nach erstem Satz statt auf vollständige Antwort warten
3. Avatar-Visual: Lip-Sync mit SadTalker oder einfache animierte 2D-Figur