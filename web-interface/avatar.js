async function buildAvatarPage() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("This script must run in a browser.");
  }

  const STATE_MACHINE_NAME = "Original State Machine";
  const IS_TALKING_INPUT = "isTalking";
  const DEFAULT_PROXY_BASE = "http://localhost:8011";

  const style = document.createElement("style");
  style.textContent = `
    :root {
      --bg-1: #061a2b;
      --bg-2: #0f3b57;
      --accent: #19c37d;
      --ink: #f1f7fb;
      --muted: #b8d1e3;
      --panel: rgba(3, 20, 34, 0.62);
      --stroke: rgba(161, 227, 198, 0.25);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 15%, #1f6f8b 0%, transparent 40%),
        radial-gradient(circle at 88% 30%, #0b7d57 0%, transparent 35%),
        linear-gradient(135deg, var(--bg-1) 0%, var(--bg-2) 60%, #08314c 100%);
      font-family: "Segoe UI", "Trebuchet MS", sans-serif;
      display: grid;
      place-items: center;
      padding: 20px;
    }

    .shell {
      width: min(980px, 100%);
      border: 1px solid var(--stroke);
      border-radius: 24px;
      overflow: hidden;
      background: var(--panel);
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(8px);
    }

    .head {
      padding: 20px 24px;
      border-bottom: 1px solid rgba(209, 242, 224, 0.18);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }

    .title {
      margin: 0;
      letter-spacing: 0.03em;
      font-size: clamp(1.2rem, 2.5vw, 1.8rem);
      font-weight: 700;
    }

    .badge {
      font-size: 0.8rem;
      color: #03221d;
      background: linear-gradient(135deg, #9be8c8, var(--accent));
      border-radius: 999px;
      padding: 8px 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }

    .stage {
      padding: 22px;
      display: grid;
      gap: 14px;
    }

    .avatar-wrap {
      border: 1px solid rgba(212, 248, 226, 0.18);
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(5, 27, 42, 0.5), rgba(5, 21, 35, 0.7));
      min-height: clamp(320px, 58vh, 620px);
      position: relative;
      overflow: hidden;
    }

    .avatar-glow {
      position: absolute;
      inset: auto auto -80px -30px;
      width: 240px;
      height: 240px;
      border-radius: 50%;
      filter: blur(35px);
      background: rgba(25, 195, 125, 0.28);
      pointer-events: none;
    }

    #riveCanvas {
      width: 100%;
      height: 100%;
      min-height: clamp(320px, 58vh, 620px);
      display: block;
    }

    .controls {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 10px;
    }

    .controls-secondary {
      grid-template-columns: 1fr auto;
    }

    .controls input, .controls button {
      border-radius: 12px;
      border: 1px solid rgba(212, 248, 226, 0.25);
      background: rgba(7, 28, 44, 0.65);
      color: var(--ink);
      padding: 10px 12px;
      font-size: 0.95rem;
    }

    .controls button {
      cursor: pointer;
      background: linear-gradient(135deg, #1da16c, #148fbd);
      border: none;
      font-weight: 700;
    }

    .controls button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .status {
      margin: 0;
      color: var(--muted);
      font-size: 0.96rem;
      letter-spacing: 0.02em;
    }

    .player-wrap {
      display: grid;
      gap: 8px;
    }

    #ttsPlayer {
      width: 100%;
      accent-color: #19c37d;
    }

    .demo-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .switch-label {
      font-size: 0.92rem;
      color: var(--muted);
      user-select: none;
      cursor: pointer;
    }

    .switch {
      position: relative;
      display: inline-block;
      width: 52px;
      height: 28px;
      flex-shrink: 0;
    }

    .switch input { opacity: 0; width: 0; height: 0; }

    .slider {
      position: absolute;
      inset: 0;
      border-radius: 999px;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(212, 248, 226, 0.25);
      transition: background 0.25s;
      cursor: pointer;
    }

    .slider::before {
      content: "";
      position: absolute;
      left: 4px;
      top: 50%;
      transform: translateY(-50%);
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--muted);
      transition: left 0.2s, background 0.25s;
    }

    .switch input:checked + .slider {
      background: linear-gradient(135deg, #1da16c, #148fbd);
      border-color: transparent;
    }

    .switch input:checked + .slider::before {
      left: 28px;
      background: #fff;
    }

    @media (max-width: 700px) {
      .head { align-items: flex-start; flex-direction: column; }
      .controls, .controls-secondary { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);

  document.body.innerHTML = `
    <main class="shell" aria-label="Interactive avatar interface">
      <header class="head">
        <h1 class="title">TalkToMe Avatar Interface</h1>
        <span class="badge">LIVE RIVE</span>
      </header>
      <section class="stage">
        <div class="avatar-wrap">
          <canvas id="riveCanvas" aria-label="Animated avatar"></canvas>
          <div class="avatar-glow"></div>
        </div>

        <div class="demo-row">
          <label class="switch" title="Simulate talking animation">
            <input type="checkbox" id="talkToggle" />
            <span class="slider"></span>
          </label>
          <label class="switch-label" for="talkToggle">Talk-Demo</label>
        </div>

        <div class="controls">
          <input id="ttsUrl" placeholder="Paste TTS audio URL (mp3/wav/ogg)" />
          <button id="playUrlBtn" type="button">Play URL</button>
          <input id="ttsFile" type="file" accept="audio/*,.m4a,audio/mp4" />
        </div>

        <div class="controls controls-secondary">
          <input id="proxyBaseUrl" value="http://localhost:8011" placeholder="Voice proxy URL" />
          <button id="speakOutputBtn" type="button">Speak output.json</button>
        </div>

        <div class="player-wrap">
          <audio id="ttsPlayer" controls preload="metadata"></audio>
        </div>

        <p class="status" id="avatarStatus">Loading avatar...</p>
      </section>
    </main>
  `;

  const status = document.getElementById("avatarStatus");
  const canvas = document.getElementById("riveCanvas");
  const ttsUrlInput = document.getElementById("ttsUrl");
  const playUrlBtn = document.getElementById("playUrlBtn");
  const ttsFileInput = document.getElementById("ttsFile");
  const proxyBaseUrlInput = document.getElementById("proxyBaseUrl");
  const speakOutputBtn = document.getElementById("speakOutputBtn");
  const ttsPlayer = document.getElementById("ttsPlayer");

  const pageBase = new URL("./", window.location.href);
  const scriptNode = document.currentScript;
  const scriptBase = scriptNode && scriptNode.src ? new URL("./", scriptNode.src) : pageBase;

  const safeHref = (path, base) => {
    try {
      return new URL(path, base).href;
    } catch (_) {
      return null;
    }
  };

  const candidates = [
    safeHref("20617-38809-chat-bot.riv", pageBase),
    safeHref("avatar.riv", pageBase),
    safeHref("20617-38809-chat-bot.riv", scriptBase),
    safeHref("avatar.riv", scriptBase),
  ];

  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    candidates.push(
      safeHref("/web-interface/20617-38809-chat-bot.riv", window.location.origin),
      safeHref("/web-interface/avatar.riv", window.location.origin)
    );
  }

  const candidateFiles = [...new Set(candidates.filter(Boolean))];

  const findRiveFile = async () => {
    if (window.location.protocol === "file:") {
      return candidateFiles[0] || null;
    }

    for (const file of candidateFiles) {
      try {
        const response = await fetch(file, { method: "GET", cache: "no-store" });
        if (response.ok) return file;
      } catch (_) {}
    }
    return null;
  };

  const src = await findRiveFile();
  if (!src) {
    if (status) status.textContent = "Avatar file not found. Checked: " + candidateFiles.join(" | ");
    return;
  }

  if (status && window.location.protocol === "file:") {
    status.textContent = "Using local file mode. If loading fails, run a local server and open [index.html](http://_vscodecontentref_/1) via http://localhost.";
  }

  if (!canvas) {
    if (status) status.textContent = "Canvas element not found.";
    return;
  }

  let riveInstance = null;
  let cleanupLipSync = null;
  let currentObjectUrl = null;

  const buildProxyUrl = (route) => {
    const raw = proxyBaseUrlInput && proxyBaseUrlInput.value
      ? proxyBaseUrlInput.value.trim()
      : DEFAULT_PROXY_BASE;
    const normalized = raw.endsWith("/") ? raw : raw + "/";
    return new URL(route, normalized).href;
  };

  const stopLipSync = () => {
    if (typeof cleanupLipSync === "function") {
      cleanupLipSync();
      cleanupLipSync = null;
    }
  };

  function getIsTalkingInput() {
    let inputs = [];
    try { inputs = riveInstance.stateMachineInputs(STATE_MACHINE_NAME) || []; } catch (_) {}
    return inputs.find((i) => i.name === IS_TALKING_INPUT) || null;
  }

  function createLipSyncDriver() {
    const attachAudio = (audioEl) => {
      if (!audioEl) return () => {};

      const input = getIsTalkingInput();
      if (!input) {
        if (status) status.textContent = "Input '" + IS_TALKING_INPUT + "' nicht gefunden in '" + STATE_MACHINE_NAME + "'.";
        return () => {};
      }

      const setTalkingFromPlayback = () => {
        input.value = !audioEl.paused && !audioEl.ended && audioEl.currentTime > 0;
      };

      const stop = () => {
        input.value = false;
        audioEl.removeEventListener("ended", stop);
        audioEl.removeEventListener("pause", onPause);
        audioEl.removeEventListener("play", onPlay);
        audioEl.removeEventListener("playing", onPlay);
        audioEl.removeEventListener("stalled", onStopLikeEvent);
        audioEl.removeEventListener("waiting", onStopLikeEvent);
        audioEl.removeEventListener("suspend", onStopLikeEvent);
        audioEl.removeEventListener("emptied", onStopLikeEvent);
        audioEl.removeEventListener("abort", onStopLikeEvent);
        audioEl.removeEventListener("error", onStopLikeEvent);
      };

      const onPause = () => { input.value = false; };
      const onPlay = () => { setTalkingFromPlayback(); };
      const onStopLikeEvent = () => { input.value = false; };

      audioEl.addEventListener("ended", stop);
      audioEl.addEventListener("pause", onPause);
      audioEl.addEventListener("play", onPlay);
      audioEl.addEventListener("playing", onPlay);
      audioEl.addEventListener("stalled", onStopLikeEvent);
      audioEl.addEventListener("waiting", onStopLikeEvent);
      audioEl.addEventListener("suspend", onStopLikeEvent);
      audioEl.addEventListener("emptied", onStopLikeEvent);
      audioEl.addEventListener("abort", onStopLikeEvent);
      audioEl.addEventListener("error", onStopLikeEvent);

      input.value = false;

      return stop;
    };

    return { attachAudio };
  }

  try {
    const riveModule = await import("https://esm.sh/@rive-app/canvas@2.31.4");
    const Rive = riveModule.Rive || (riveModule.default && riveModule.default.Rive) || riveModule.default;
    const Layout = riveModule.Layout || (riveModule.default && riveModule.default.Layout);
    const Fit = riveModule.Fit || (riveModule.default && riveModule.default.Fit);
    const Alignment = riveModule.Alignment || (riveModule.default && riveModule.default.Alignment);

    const baseConfig = {
      src,
      canvas,
      autoplay: true,
      layout: new Layout({
        fit: Fit.Contain,
        alignment: Alignment.Center,
      }),
      onLoad: () => {
        const input = getIsTalkingInput();
        if (input) input.value = false;
        if (status) status.textContent = "Avatar bereit.";
      },
    };

    try {
      riveInstance = new Rive({ ...baseConfig, stateMachines: STATE_MACHINE_NAME });
    } catch (_) {
      riveInstance = new Rive(baseConfig);
      if (status) status.textContent = "Avatar loaded without state machine: " + src;
    }

    const resizeRiveCanvas = () => {
      try { riveInstance && riveInstance.resizeDrawingSurfaceToCanvas(); } catch (_) {}
    };

    resizeRiveCanvas();
    window.addEventListener("resize", resizeRiveCanvas);

    const lipSync = createLipSyncDriver();

    const playAudioAndSync = async (audioEl) => {
      stopLipSync();
      cleanupLipSync = lipSync.attachAudio(audioEl);
      try {
        await audioEl.play();
        if (status) status.textContent = "Audio wird abgespielt.";
      } catch (err) {
        stopLipSync();
        const msg = err instanceof Error ? err.message : String(err);
        if (status) status.textContent = "Audio play fehlgeschlagen: " + msg;
      }
    };

    window.playAvatarTTS = async (source) => {
      let audioEl = ttsPlayer instanceof HTMLAudioElement ? ttsPlayer : null;
      let objectUrl = null;

      if (!audioEl) {
        audioEl = new Audio();
      }

      audioEl.pause();
      audioEl.currentTime = 0;

      if (currentObjectUrl) {
        try { URL.revokeObjectURL(currentObjectUrl); } catch (_) {}
        currentObjectUrl = null;
      }

      if (typeof source === "string") {
        audioEl.src = source;
        audioEl.crossOrigin = "anonymous";
      } else if (source instanceof Blob) {
        const isM4AFile = typeof File !== "undefined" && source instanceof File && /\.m4a$/i.test(source.name || "");
        const normalizedBlob = !source.type && isM4AFile
          ? source.slice(0, source.size, "audio/mp4")
          : source;

        objectUrl = URL.createObjectURL(normalizedBlob);
        currentObjectUrl = objectUrl;
        audioEl.src = objectUrl;
      } else if (source instanceof HTMLAudioElement) {
        audioEl = source;
      } else {
        throw new Error("playAvatarTTS expects URL string, Blob, or HTMLAudioElement.");
      }

      audioEl.preload = "auto";
      audioEl.playsInline = true;
      audioEl.volume = 1;
      audioEl.muted = false;
      audioEl.loop = false;

      audioEl.addEventListener("loadedmetadata", () => {
        if (status) status.textContent = "Audio loaded: " + Math.round(audioEl.duration * 10) / 10 + "s";
      }, { once: true });

      audioEl.addEventListener("error", () => {
        if (status) status.textContent = "Audio error while loading/playing.";
      }, { once: true });

      await playAudioAndSync(audioEl);
      return audioEl;
    };

    const speakOutputFromProxy = async () => {
      const proxyUrl = buildProxyUrl("api/speak-output");
      if (status) status.textContent = "Generating speech from output.json...";

      const response = await fetch(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "kokoro", voice: "martin", lang: "de", speed: 1.0 }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error("Proxy request failed (" + response.status + "): " + details);
      }

      const audioBlob = await response.blob();
      await window.playAvatarTTS(audioBlob);
    };

    if (playUrlBtn) {
      playUrlBtn.addEventListener("click", async () => {
        const url = ttsUrlInput && ttsUrlInput.value ? ttsUrlInput.value.trim() : "";
        if (!url) {
          if (status) status.textContent = "Paste an audio URL first.";
          return;
        }
        await window.playAvatarTTS(url);
      });
    }

    if (ttsFileInput) {
      ttsFileInput.addEventListener("change", async (event) => {
        const input = event.target;
        const file = input && input.files && input.files[0] ? input.files[0] : null;
        if (!file) return;
        await window.playAvatarTTS(file);
      });
    }

    if (speakOutputBtn) {
      speakOutputBtn.addEventListener("click", async () => {
        speakOutputBtn.disabled = true;
        try {
          await speakOutputFromProxy();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (status) status.textContent = "output.json speech failed: " + message;
        } finally {
          speakOutputBtn.disabled = false;
        }
      });
    }

    const talkToggle = document.getElementById("talkToggle");

    const startDemoTalk = () => {
      const input = getIsTalkingInput();
      if (!input) { if (status) status.textContent = "Input '" + IS_TALKING_INPUT + "' nicht gefunden."; return; }
      input.value = true;
      if (status) status.textContent = "Talk-Demo aktiv.";
    };

    const stopDemoTalk = () => {
      const input = getIsTalkingInput();
      if (input) input.value = false;
      if (status) status.textContent = "Talk-Demo gestoppt.";
    };

    if (talkToggle) {
      talkToggle.addEventListener("change", () => {
        if (talkToggle.checked) { stopLipSync(); startDemoTalk(); }
        else { stopDemoTalk(); }
      });
    }

    if (status) {
      status.textContent = "Avatar ready. Click Speak output.json for model TTS with lip-sync.";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (status) status.textContent = "Avatar failed to load: " + message;
    console.error("Rive initialization error:", error);
  }
}

buildAvatarPage();