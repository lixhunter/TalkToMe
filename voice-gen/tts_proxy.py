#!/usr/bin/env python3
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT_DIR = Path(__file__).resolve().parents[1]
OUTPUT_JSON_PATH = Path(os.getenv("OUTPUT_JSON_PATH", ROOT_DIR / "output.json"))
KOKORO_URL = os.getenv("KOKORO_URL", "http://localhost:8881/v1/audio/speech")
ALLOW_ORIGIN = os.getenv("VOICE_PROXY_ALLOW_ORIGIN", "*")
HOST = os.getenv("VOICE_PROXY_HOST", "127.0.0.1")
PORT = int(os.getenv("VOICE_PROXY_PORT", "8011"))


def read_output_payload() -> dict:
    if not OUTPUT_JSON_PATH.exists():
        raise FileNotFoundError(f"output.json not found at {OUTPUT_JSON_PATH}")

    with OUTPUT_JSON_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, dict):
        raise ValueError("output.json must contain a JSON object")

    return data


def extract_text_from_output(payload: dict) -> str:
    for key in ("message", "text", "reply", "response"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    return json.dumps(payload, ensure_ascii=False)


def post_json(url: str, payload: dict):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "audio/wav, application/json"},
    )

    with urlopen(req, timeout=120) as response:
        return response.getcode(), response.read(), response.headers.get("Content-Type", "audio/wav")


class VoiceGenHandler(BaseHTTPRequestHandler):
    server_version = "VoiceGenProxy/1.0"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", ALLOW_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path != "/api/output":
            self._send_json(404, {"error": "not found"})
            return

        try:
            payload = read_output_payload()
            text = extract_text_from_output(payload)
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})
            return

        self._send_json(200, {"output": payload, "text": text})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"

        try:
            request_body = json.loads(raw_body.decode("utf-8") or "{}")
            if not isinstance(request_body, dict):
                raise ValueError("Body must be a JSON object")
        except Exception as exc:
            self._send_json(400, {"error": f"invalid json: {exc}"})
            return

        if self.path == "/api/tts":
            payload = request_body
        elif self.path == "/api/speak-output":
            try:
                output_payload = read_output_payload()
                text = request_body.get("input") or extract_text_from_output(output_payload)
            except Exception as exc:
                self._send_json(500, {"error": str(exc)})
                return

            payload = {
                "model": request_body.get("model", "kokoro"),
                "input": text,
                "voice": request_body.get("voice", "martin"),
                "speed": request_body.get("speed", 1.0),
                "lang": request_body.get("lang", "de"),
            }
        else:
            self._send_json(404, {"error": "not found"})
            return

        try:
            status, data, content_type = post_json(KOKORO_URL, payload)
            self.send_response(status)
            self._cors()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            self._send_json(exc.code, {"error": "kokoro request failed", "details": details})
        except URLError as exc:
            self._send_json(502, {"error": "kokoro service unreachable", "details": str(exc)})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})


def main():
    server = ThreadingHTTPServer((HOST, PORT), VoiceGenHandler)
    print(f"Voice proxy listening on http://{HOST}:{PORT}")
    print(f"Using output file: {OUTPUT_JSON_PATH}")
    print(f"Forwarding TTS to: {KOKORO_URL}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
