import json
import os
import subprocess
import tempfile

from fastapi import FastAPI, File, UploadFile

# --- Config (hardcoded, Hackathon-Modus) ---
MODEL_PATH = os.getenv("STT_MODEL_PATH", "/models/ggml-large-v3.bin")
WHISPER_BIN = os.getenv("WHISPER_BIN", "/opt/whisper.cpp/build/bin/whisper-cli")
LANGUAGE = "de"

app = FastAPI(title="STT-Service (whisper.cpp/Vulkan)")


def to_wav(src_path: str) -> str:
    """WebM/beliebig -> 16kHz mono WAV (whisper.cpp braucht genau das)."""
    dst_path = src_path + ".wav"
    subprocess.run(
        ["ffmpeg", "-y", "-i", src_path, "-ar", "16000", "-ac", "1", dst_path],
        check=True,
        capture_output=True,
    )
    return dst_path


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_PATH}


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix="_in") as tmp:
        tmp.write(await audio.read())
        src_path = tmp.name

    wav_path = to_wav(src_path)
    json_out = wav_path + ".json"

    # -l de Sprache, -oj JSON-Datei, GPU (Vulkan) default an
    subprocess.run(
        [
            WHISPER_BIN,
            "-m", MODEL_PATH,
            "-f", wav_path,
            "-l", LANGUAGE,
            "-oj",          # JSON-Output -> <wav>.json
            "-of", wav_path,  # output prefix
        ],
        check=True,
        capture_output=True,
    )

    with open(json_out) as f:
        data = json.load(f)

    text = "".join(seg["text"] for seg in data["transcription"]).strip()

    for p in (src_path, wav_path, json_out):
        if os.path.exists(p):
            os.remove(p)

    return {"text": text, "language": data.get("result", {}).get("language", LANGUAGE)}
