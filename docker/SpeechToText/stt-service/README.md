# STT-Service

whisper.cpp `large-v3`, **Vulkan-Backend** (AMD-GPU via Mesa RADV). FastAPI-Wrapper. Port 8001.

## Run (Docker, AMD-GPU)

Voraussetzung Host: AMD-Treiber + Mesa RADV (Standard auf Linux), User in Gruppe `render`/`video`.

```bash
docker compose up --build
```

- Build kompiliert whisper.cpp mit `-DGGML_VULKAN=1` (dauert).
- Erster Start lädt `ggml-large-v3.bin` (~3GB) → `whisper-models` Volume.
- Log zeigt `vulkaninfo` GPU-Name → bestätigt GPU sichtbar im Container.

## Endpoints

```
GET  /health      -> { status, model }
POST /transcribe  -> multipart { audio } -> { text, language }
```

Test:
```bash
curl -F "audio=@sample.webm" http://localhost:8001/transcribe
```

## AMD-GPU im Container

Passthrough via `/dev/dri` + `group_add: [video, render]` (siehe docker-compose.yml).
Check ob GPU sichtbar:
```bash
docker compose run --rm stt-service vulkaninfo --summary | grep deviceName
```
Leer → GPU nicht durchgereicht → whisper.cpp fällt auf CPU zurück (langsam).

## Bekannte Stolperstellen

- **glslc / Shader-Compiler:** Vulkan-Build braucht `glslc` (im Dockerfile via apt). Schlägt der Build hier fehl → Vulkan SDK / `glslang-tools` prüfen.
- **kein Vulkan auf Host:** `vulkaninfo` muss auf Host laufen. Sonst Treiber/Mesa nachinstallieren.
- Whisper.cpp will 16kHz mono WAV → ffmpeg konvertiert WebM automatisch im Service.

## Architektur-Notiz

faster-whisper (CTranslate2) verworfen: **kein AMD/ROCm-Support**. whisper.cpp Vulkan = portabler GPU-Pfad auf AMD.
