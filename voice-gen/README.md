# Voice-Gen Proxy for Kokoro Martin

This folder contains a local proxy service that:

- reads output.json
- extracts text (message, text, reply, or response)
- calls http://localhost:8881/v1/audio/speech
- returns audio with CORS headers so the web avatar can fetch it

## Start (Node.js)

From this folder:

```powershell
npm run start
```

Default URL: http://127.0.0.1:8011

## Endpoints

- GET /api/output
  - Returns parsed output.json and extracted text.
- POST /api/speak-output
  - Reads output.json, generates speech, returns WAV bytes.
- POST /api/tts
  - Forwards a custom JSON body directly to Kokoro.

## Environment Variables

- VOICE_PROXY_HOST (default 127.0.0.1)
- VOICE_PROXY_PORT (default 8011)
- KOKORO_URL (default http://localhost:8881/v1/audio/speech)
- OUTPUT_JSON_PATH (default ../output.json)
- VOICE_PROXY_ALLOW_ORIGIN (default *)

## Quick Test

```powershell
curl.exe http://127.0.0.1:8011/api/output
curl.exe -X POST http://127.0.0.1:8011/api/speak-output --output .\\output.wav
```

## Python Alternative

If Python is installed, you can also run:

```powershell
python .\\tts_proxy.py
```
