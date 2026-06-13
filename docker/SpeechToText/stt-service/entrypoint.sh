#!/usr/bin/env bash
set -e

MODEL_PATH="${STT_MODEL_PATH:-/models/ggml-large-v3.bin}"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin"

# Modell laden falls nicht im Volume vorhanden (~3GB, nur 1x)
if [ ! -f "$MODEL_PATH" ]; then
    echo "[STT] Modell fehlt, lade von HuggingFace -> $MODEL_PATH"
    mkdir -p "$(dirname "$MODEL_PATH")"
    curl -L --fail -o "$MODEL_PATH" "$MODEL_URL"
fi

# GPU-Check (sichtbar im Log)
vulkaninfo --summary 2>/dev/null | grep -i "deviceName" || echo "[STT] WARN: keine Vulkan-GPU sichtbar -> CPU"

exec uvicorn main:app --host 0.0.0.0 --port 8001
