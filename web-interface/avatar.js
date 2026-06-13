async function buildAvatarPage() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("This script must run in a browser.");
  }

  const STATE_MACHINE_NAME = "State Machine 1";
  const MOUTH_INPUT_HINTS = ["MouthOpen", "Talk", "JawOpen", "Viseme", "Mouth", "Open"];

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

    @media (max-width: 700px) {
      .head { align-items: flex-start; flex-direction: column; }
      .controls { grid-template-columns: 1fr; }
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

        <div class="controls">
          <input id="ttsUrl" placeholder="Paste TTS audio URL (mp3/wav/ogg)" />
          <button id="playUrlBtn" type="button">Play URL</button>
          <input id="ttsFile" type="file" accept="audio/*,.m4a,audio/mp4" />
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

  const stopLipSync = () => {
    if (typeof cleanupLipSync === "function") {
      cleanupLipSync();
      cleanupLipSync = null;
    }
  };

  function createLipSyncDriver({ rive, stateMachineName }) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();

    const getMouthInput = () => {
      let inputs = [];
      try {
        inputs = rive.stateMachineInputs(stateMachineName)  || [];
      } catch (_) {}

      const numbers = inputs.filter((i) => String(i.type).toLowerCase() === "number");
      if (!numbers.length) return null;

      for (const hint of MOUTH_INPUT_HINTS) {
        const hit = numbers.find((i) => i.name.toLowerCase().includes(hint.toLowerCase()));
        if (hit) return hit;
      }
      return numbers[0];
    };

    const mouthInput = getMouthInput();
    if (!mouthInput) {
      if (status) status.textContent = "No numeric mouth input found in " + stateMachineName + ".";
      return { attachAudio: async () => () => {} };
    }

    // if (status) status.textContent = "Avatar loaded. Lip-sync input: " + mouthInput.name;

    const sourceMap = new WeakMap();

    const attachAudio = async (audioEl) => {
      if (!audioEl) return () => {};
      if (audioCtx.state !== "running") {
        try { await audioCtx.resume(); } catch (_) {}
      }

      let sourceNode = sourceMap.get(audioEl);
      if (!sourceNode) {
        try {
          sourceNode = audioCtx.createMediaElementSource(audioEl);
          sourceMap.set(audioEl, sourceNode);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (status) status.textContent = "Audio loaded, but lip-sync analyzer could not attach: " + msg;
          return () => {};
        }
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;

      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);

      const data = new Uint8Array(analyser.fftSize);
      let rafId = 0;
      let active = true;

      const tick = () => {
        if (!active) return;
        analyser.getByteTimeDomainData(data);

        let sumSq = 0;
        for (let i = 0; i < data.length; i += 1) {
          const centered = (data[i] - 128) / 128;
          sumSq += centered * centered;
        }

        const rms = Math.sqrt(sumSq / data.length);
        const gate = 0.014;
        const gain = 18;
        const value = Math.max(0, Math.min(1, (rms - gate) * gain));
        mouthInput.value = value;

        rafId = window.requestAnimationFrame(tick);
      };

      const stop = () => {
        active = false;
        if (rafId) window.cancelAnimationFrame(rafId);
        mouthInput.value = 0;

        try { sourceNode.disconnect(analyser); } catch (_) {}
        try { analyser.disconnect(); } catch (_) {}

        audioEl.removeEventListener("ended", stop);
        audioEl.removeEventListener("pause", onPause);
      };

      const onPause = () => { mouthInput.value = 0; };

      audioEl.addEventListener("ended", stop);
      audioEl.addEventListener("pause", onPause);

      tick();
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
        if (status) status.textContent = "Avatar loaded: " + src;
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

    const lipSync = createLipSyncDriver({
      rive: riveInstance,
      stateMachineName: STATE_MACHINE_NAME,
    });

    const playAudioAndSync = async (audioEl) => {
      stopLipSync();

      try {
        cleanupLipSync = await lipSync.attachAudio(audioEl);
        await audioEl.play();
        if (status) status.textContent = "Playing audio with lip-sync.";
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (status) status.textContent = "Audio play failed: " + msg;
      }
    };

    window.playAvatarTTS = async (source) => {
      let audioEl = null;
      let objectUrl = null;

      if (typeof source === "string") {
        audioEl = new Audio(source);
        audioEl.crossOrigin = "anonymous";
      } else if (source instanceof Blob) {
        const isM4AFile = typeof File !== "undefined" && source instanceof File && /\.m4a$/i.test(source.name || "");
        const normalizedBlob = !source.type && isM4AFile
          ? source.slice(0, source.size, "audio/mp4")
          : source;

        objectUrl = URL.createObjectURL(normalizedBlob);
        audioEl = new Audio(objectUrl);
      } else if (source instanceof HTMLAudioElement) {
        audioEl = source;
      } else {
        throw new Error("playAvatarTTS expects URL string, Blob, or HTMLAudioElement.");
      }

      audioEl.preload = "auto";
      audioEl.playsInline = true;

      if (objectUrl) {
        audioEl.addEventListener("ended", () => {
          try { URL.revokeObjectURL(objectUrl); } catch (_) {}
        }, { once: true });
      }

      await playAudioAndSync(audioEl);
      return audioEl;
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

    if (status) {
      status.textContent = "Avatar ready. Use Play URL, choose an audio file, or call window.playAvatarTTS(source).";
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (status) status.textContent = "Avatar failed to load: " + message;
    console.error("Rive initialization error:", error);
  }
}

buildAvatarPage();