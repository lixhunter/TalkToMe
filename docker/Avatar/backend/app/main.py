import json
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel


app = FastAPI(title="Avatar Agent API")

VOICE_GEN_BASE_URL = os.getenv("VOICE_GEN_BASE_URL", "http://voice-gen:8011").rstrip("/")
VOICE_GEN_MODEL = os.getenv("VOICE_GEN_MODEL", "kokoro")
VOICE_GEN_VOICE = os.getenv("VOICE_GEN_VOICE", "martin")
VOICE_GEN_LANG = os.getenv("VOICE_GEN_LANG", "de")
VOICE_GEN_SPEED = float(os.getenv("VOICE_GEN_SPEED", "1.0"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str


class TtsRequest(BaseModel):
    text: str


class VoiceSpeakOutputRequest(BaseModel):
    model: str | None = None
    input: str | None = None
    voice: str | None = None
    speed: float | None = None
    lang: str | None = None


def _voice_gen_url(path: str) -> str:
    return f"{VOICE_GEN_BASE_URL}{path}"


def _proxy_get(path: str) -> tuple[int, bytes, str]:
    req = Request(_voice_gen_url(path), method="GET")
    with urlopen(req, timeout=120) as response:
        return (
            response.getcode(),
            response.read(),
            response.headers.get("Content-Type", "application/json; charset=utf-8"),
        )


def _proxy_post(path: str, payload: dict) -> tuple[int, bytes, str]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(
        _voice_gen_url(path),
        method="POST",
        data=body,
        headers={"Content-Type": "application/json", "Accept": "audio/wav, application/json"},
    )
    with urlopen(req, timeout=180) as response:
        return (
            response.getcode(),
            response.read(),
            response.headers.get("Content-Type", "audio/wav"),
        )


@app.post("/ask", response_model=AskResponse)
def ask(request: AskRequest) -> AskResponse:
    return AskResponse(
        answer=(
            "Das Backend ist verbunden. Fuer diese Demo nutze ich noch eine einfache "
            f"Platzhalterantwort auf: {request.question}"
        )
    )


@app.post("/tts")
def tts(request: TtsRequest):
    payload = {
        "model": VOICE_GEN_MODEL,
        "input": request.text,
        "voice": VOICE_GEN_VOICE,
        "speed": VOICE_GEN_SPEED,
        "lang": VOICE_GEN_LANG,
    }
    try:
        status, data, content_type = _proxy_post("/api/tts", payload)
        return Response(content=data, status_code=status, media_type=content_type)
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=exc.code, detail=details) from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"voice-gen unreachable: {exc}") from exc


@app.get("/voice/output")
def voice_output():
    try:
        status, data, content_type = _proxy_get("/api/output")
        return Response(content=data, status_code=status, media_type=content_type)
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=exc.code, detail=details) from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"voice-gen unreachable: {exc}") from exc


@app.post("/voice/speak-output")
def voice_speak_output(request: VoiceSpeakOutputRequest):
    payload = {
        "model": request.model or VOICE_GEN_MODEL,
        "voice": request.voice or VOICE_GEN_VOICE,
        "speed": request.speed if request.speed is not None else VOICE_GEN_SPEED,
        "lang": request.lang or VOICE_GEN_LANG,
    }
    if request.input:
        payload["input"] = request.input

    try:
        status, data, content_type = _proxy_post("/api/speak-output", payload)
        return Response(content=data, status_code=status, media_type=content_type)
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=exc.code, detail=details) from exc
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"voice-gen unreachable: {exc}") from exc
