from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


app = FastAPI(title="Avatar Agent API")

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


@app.post("/ask", response_model=AskResponse)
def ask(request: AskRequest) -> AskResponse:
    return AskResponse(
        answer=(
            "Das Backend ist verbunden. Fuer diese Demo nutze ich noch eine einfache "
            f"Platzhalterantwort auf: {request.question}"
        )
    )


@app.post("/tts")
def tts(_: TtsRequest):
    raise HTTPException(status_code=501, detail="TTS is not configured yet")
