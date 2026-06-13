import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = process.env.VOICE_PROXY_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.VOICE_PROXY_PORT || "8011", 10);
const ALLOW_ORIGIN = process.env.VOICE_PROXY_ALLOW_ORIGIN || "*";
const KOKORO_URL = process.env.KOKORO_URL || "http://localhost:8881/v1/audio/speech";
const OUTPUT_JSON_PATH = process.env.OUTPUT_JSON_PATH || path.resolve(__dirname, "..", "output.json");

function addCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf-8");
  res.statusCode = status;
  addCors(res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", String(body.length));
  res.end(body);
}

async function readJsonBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }

  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Body must be a JSON object");
  }
  return parsed;
}

async function readOutputPayload() {
  const raw = await fs.readFile(OUTPUT_JSON_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("output.json must contain a JSON object");
  }
  return parsed;
}

function extractText(payload) {
  const keys = ["message", "text", "reply", "response"];
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return JSON.stringify(payload);
}

async function proxyToKokoro(payload) {
  const response = await fetch(KOKORO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/wav, application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "audio/wav";
  return {
    ok: response.ok,
    status: response.status,
    contentType,
    body,
  };
}

const server = http.createServer(async (req, res) => {
  addCors(res);

  if (!req.url || !req.method) {
    sendJson(res, 400, { error: "invalid request" });
    return;
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/api/output") {
      const output = await readOutputPayload();
      sendJson(res, 200, { output, text: extractText(output) });
      return;
    }

    if (req.method === "POST" && req.url === "/api/tts") {
      const payload = await readJsonBody(req);
      const result = await proxyToKokoro(payload);

      if (!result.ok) {
        sendJson(res, result.status, {
          error: "kokoro request failed",
          details: result.body.toString("utf-8"),
        });
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Length", String(result.body.length));
      res.end(result.body);
      return;
    }

    if (req.method === "POST" && req.url === "/api/speak-output") {
      const input = await readJsonBody(req);
      const output = await readOutputPayload();
      const payload = {
        model: input.model || "kokoro",
        input: input.input || extractText(output),
        voice: input.voice || "martin",
        speed: input.speed ?? 1.0,
        lang: input.lang || "de",
      };

      const result = await proxyToKokoro(payload);
      if (!result.ok) {
        sendJson(res, result.status, {
          error: "kokoro request failed",
          details: result.body.toString("utf-8"),
        });
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Length", String(result.body.length));
      res.end(result.body);
      return;
    }

    sendJson(res, 404, { error: "not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Voice proxy listening on http://${HOST}:${PORT}`);
  console.log(`Using output file: ${OUTPUT_JSON_PATH}`);
  console.log(`Forwarding TTS to: ${KOKORO_URL}`);
});
