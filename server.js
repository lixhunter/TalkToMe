const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs/promises");
const path = require("node:path");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 5500);
const VOICE_PROXY_URL = process.env.VOICE_PROXY_URL || "http://127.0.0.1:8011/api/speak-output";
const AVATAR_UI_URL = process.env.AVATAR_UI_URL || "http://127.0.0.1:5173";

const ROOT_DIR = __dirname;
const OUTPUT_JSON_PATH = path.join(ROOT_DIR, "output.json");
const sseClients = new Set();

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

function applyCorsHeaders(response, request) {
  const requestedHeaders =
    typeof request?.headers?.["access-control-request-headers"] === "string"
      ? request.headers["access-control-request-headers"]
      : "";
  const allowHeaders = requestedHeaders || "Content-Type, Range, Accept, Origin";

  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", allowHeaders);
  response.setHeader("Access-Control-Max-Age", "600");
  response.setHeader("Vary", "Origin, Access-Control-Request-Headers");
}

function normalizePathname(pathname) {
  if (!pathname || pathname === "/") {
    return "/";
  }
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function writeSseEvent(response, eventName, payload) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastEvent(eventName, payload) {
  for (const client of sseClients) {
    try {
      writeSseEvent(client, eventName, payload);
    } catch (error) {
      sseClients.delete(client);
    }
  }
}

function handleEventsStream(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  response.write(": connected\n\n");
  sseClients.add(response);

  const keepAlive = setInterval(() => {
    if (!response.writableEnded) {
      response.write(": keep-alive\n\n");
    }
  }, 25000);

  request.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(response);
  });
}

function getClientAddress(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim().length > 0) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.socket.remoteAddress || "";
}

function normalizeAddress(address) {
  if (!address) {
    return "";
  }
  if (address === "::1") {
    return "127.0.0.1";
  }
  if (address.startsWith("::ffff:")) {
    return address.slice(7);
  }
  return address;
}

function isPrivateNetworkAddress(address) {
  const normalized = normalizeAddress(address).toLowerCase();
  if (!normalized) {
    return false;
  }

  const ipv4Match = normalized.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number);
    const [a, b] = octets;
    if (octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
      return false;
    }

    if (a === 10 || a === 127) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    return false;
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  return false;
}

function isLanRequest(request) {
  return isPrivateNetworkAddress(getClientAddress(request));
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function proxyUiRequest(request, response, requestUrl) {
  const upstream = new URL(AVATAR_UI_URL);
  const transport = upstream.protocol === "https:" ? https : http;
  const upstreamPath = requestUrl.pathname + requestUrl.search;

  const proxyRequest = transport.request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === "https:" ? 443 : 80),
      path: upstreamPath,
      method: "GET",
      headers: {
        ...request.headers,
        host: upstream.host,
      },
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 502, {
        ...proxyResponse.headers,
        "Cache-Control": proxyResponse.headers["cache-control"] || "no-store",
      });
      proxyResponse.pipe(response);
    }
  );

  proxyRequest.on("error", (error) => {
    console.error("Avatar UI request failed:", error);
    sendJson(response, 502, {
      error: "Avatar UI is unavailable",
      details: error instanceof Error ? error.message : String(error),
      hint: `Start docker/Avatar frontend and keep AVATAR_UI_URL=${AVATAR_UI_URL}`,
    });
  });

  request.on("close", () => {
    proxyRequest.destroy();
  });

  proxyRequest.end();
}

async function handleGetOutputJson(response) {
  try {
    const fileContent = await fs.readFile(OUTPUT_JSON_PATH, "utf8");
    const parsed = JSON.parse(fileContent);
    sendJson(response, 200, parsed);
  } catch (error) {
    console.error("Failed to read output.json:", error);
    sendJson(response, 500, { error: "Failed to read output.json" });
  }
}

function extractVoiceText(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  for (const key of ["message", "text", "reply", "response"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return JSON.stringify(payload);
}

function shortenForLog(text, maxLength = 180) {
  if (typeof text !== "string") {
    return "";
  }
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, maxLength - 3))}...`;
}

async function handleGetVoiceOutput(response) {
  try {
    const fileContent = await fs.readFile(OUTPUT_JSON_PATH, "utf8");
    const parsed = JSON.parse(fileContent);
    sendJson(response, 200, {
      output: parsed,
      text: extractVoiceText(parsed),
    });
  } catch (error) {
    console.error("Failed to read voice output from output.json:", error);
    sendJson(response, 500, { error: "Failed to read output.json" });
  }
}

async function handlePutOutputJson(request, response) {
  try {
    const body = await readRequestBody(request);
    const parsed = JSON.parse(body || "{}");
    await fs.writeFile(OUTPUT_JSON_PATH, JSON.stringify(parsed, null, 2) + "\n", "utf8");
    const changedAt = new Date().toISOString();
    const sourceIp = normalizeAddress(getClientAddress(request));
    const voiceText = shortenForLog(extractVoiceText(parsed));
    console.log(
      `[output-json-updated] ${changedAt} from=${sourceIp || "unknown"} text="${voiceText}"`
    );
    broadcastEvent("output-json-updated", {
      type: "output-json-updated",
      changedAt,
    });
    sendJson(response, 200, { ok: true, savedAt: changedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 400, { error: "Invalid JSON", details: message });
  }
}

async function proxySpeakOutput(request, response) {
  const upstream = new URL(VOICE_PROXY_URL);
  const body = await readRequestBody(request);
  const headers = {
    "Content-Type": request.headers["content-type"] || "application/json",
    "Content-Length": Buffer.byteLength(body),
  };

  const transport = upstream.protocol === "https:" ? https : http;
  const proxyRequest = transport.request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === "https:" ? 443 : 80),
      path: upstream.pathname + upstream.search,
      method: "POST",
      headers,
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 502, {
        "Content-Type": proxyResponse.headers["content-type"] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      proxyResponse.pipe(response);
    }
  );

  proxyRequest.on("error", (error) => {
    console.error("Voice proxy request failed:", error);
    sendJson(response, 502, {
      error: "Voice proxy request failed",
      details: error instanceof Error ? error.message : String(error),
    });
  });

  proxyRequest.end(body);
}

const server = http.createServer(async (request, response) => {
  applyCorsHeaders(response, request);
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const method = (request.method || "GET").toUpperCase();
  const pathname = normalizePathname(requestUrl.pathname);
  const isOutputJsonRoute =
    pathname === "/api/output-json" || pathname === "/api/outpt-json";

  if (method === "OPTIONS") {
    response.writeHead(204, {
      Allow: "GET, HEAD, PUT, POST, OPTIONS",
    });
    response.end();
    return;
  }

  if (method === "GET" && isOutputJsonRoute) {
    await handleGetOutputJson(response);
    return;
  }

  if (method === "GET" && pathname === "/api/events") {
    handleEventsStream(request, response);
    return;
  }

  if ((method === "PUT" || method === "POST") && isOutputJsonRoute) {
    if (!isLanRequest(request)) {
      sendJson(response, 403, { error: "Only LAN clients can update output.json" });
      return;
    }
    await handlePutOutputJson(request, response);
    return;
  }

  if (method === "POST" && pathname === "/api/speak-output") {
    await proxySpeakOutput(request, response);
    return;
  }

  if (method === "POST" && pathname === "/voice/speak-output") {
    await proxySpeakOutput(request, response);
    return;
  }

  if (method === "GET" && pathname === "/voice/output") {
    await handleGetVoiceOutput(response);
    return;
  }

  if (method === "GET" && pathname === "/output.json") {
    await handleGetOutputJson(response);
    return;
  }

  if (method !== "GET") {
    sendJson(response, 405, {
      error: "Method not allowed",
      method,
      path: pathname,
      hint: "Use PUT or POST with /api/output-json",
    });
    return;
  }

  await proxyUiRequest(request, response, requestUrl);
});

server.listen(PORT, HOST, () => {
  console.log(`TalkToMe server listening on http://${HOST}:${PORT}`);
  console.log(`Proxying UI to ${AVATAR_UI_URL}`);
  console.log(`Editing ${OUTPUT_JSON_PATH}`);
  console.log(`Voice proxy -> ${VOICE_PROXY_URL}`);
});