
## TalkToMe – Der sprechende Hub Avatar

Wie können Menschen intuitiv mit digitalen Systemen interagieren? Entwickelt einen sprachgesteuerten Avatar-Prototypen für den Jena Digital Innovation Hub, der Besucher:innen in natürlicher Sprache begleitet, informiert und mit ihnen interagiert.

**Deine Challenge**

Entwickelt einen interaktiven Avatar mit Sprachsteuerung, der auf Nutzer:innen reagiert, Informationen vermittelt und ein immersives Erlebnis schafft. Im Fokus stehen natürliche Sprachinteraktion, Echtzeit-Feedback sowie eine innovative und intuitive User Experience für den Einsatz als digitales Exponat im Hub.

## TalkToMe – The Talking Hub Avatar

How can people interact intuitively with digital systems? Develop a voice-controlled avatar prototype for the Jena Digital Innovation Hub that guides, informs, and interacts with visitors using natural language.

**Your Challenge**

Develop an interactive, voice-controlled avatar that responds to users, conveys information, and creates an immersive experience. The focus is on natural language interaction, real-time feedback, and an innovative and intuitive user experience for use as a digital exhibit in the Hub.

## Quick Start (Avatar UI + LAN/API Server)

1. Start the Avatar frontend:
- `npm run start:avatar`
2. In a second terminal, start the shared server from this folder:
- `npm start`
3. Open:
- `http://localhost:5500`
4. Other people on the same network can open:
- `http://YOUR-PC-IP:5500`

The root server keeps all LAN/server capabilities and now proxies the UI from `docker/Avatar`.

API endpoints for shared `output.json` editing (from local network):
- `GET /api/output-json` (or `/api/outpt-json`) -> read current JSON
- `PUT /api/output-json` (or `/api/outpt-json`) -> replace JSON
- `POST /api/output-json` (or `/api/outpt-json`) -> replace JSON

Example from another device on the same network:
- `curl -X PUT http://YOUR-PC-IP:5500/api/output-json -H "Content-Type: application/json" -d "{\"status\":\"online\",\"message\":\"Hello from LAN\"}"`

Security note:
- Write requests are accepted only from local/private network addresses (LAN/loopback).

Optional voice setup:
- Start `voice-gen/tts_proxy.py` on this machine if you want the `Speak output.json` button to work.
- The server proxies that button to `http://127.0.0.1:8011/api/speak-output` by default.

Optional environment variables for `npm start`:
- `AVATAR_UI_URL` (default: `http://127.0.0.1:5173`)
- `VOICE_PROXY_URL` (default: `http://127.0.0.1:8011/api/speak-output`)
