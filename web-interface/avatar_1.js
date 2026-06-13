async function buildAvatarPage() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("This script must run in a browser.");
  }

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

    * {
      box-sizing: border-box;
    }

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

    .status {
      margin: 0;
      color: var(--muted);
      font-size: 0.96rem;
      letter-spacing: 0.02em;
    }

    @media (max-width: 700px) {
      .head {
        align-items: flex-start;
        flex-direction: column;
      }
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
        <p class="status" id="avatarStatus">Loading avatar...</p>
      </section>
    </main>
  `;

  const status = document.getElementById("avatarStatus");
  const canvas = document.getElementById("riveCanvas");
  const pageBase = new URL("./", window.location.href);
  const scriptNode = document.currentScript;
  const scriptBase = scriptNode?.src ? new URL("./", scriptNode.src) : pageBase;

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
      safeHref("/web-interface/avatar.riv", window.location.origin),
    );
  }

  const candidateFiles = [...new Set(candidates.filter(Boolean))];

  const findRiveFile = async () => {
    // Browsers can block fetch() checks on local file:// pages, producing false
    // "not found" results even when the asset is present.
    if (window.location.protocol === "file:") {
      return candidateFiles[0] ?? null;
    }

    for (const file of candidateFiles) {
      try {
        const response = await fetch(file, { method: "GET", cache: "no-store" });
        if (response.ok) {
          return file;
        }
      } catch (_) {
        // Ignore and try the next fallback file.
      }
    }

    return null;
  };

  const src = await findRiveFile();

  if (!src) {
    if (status) {
      status.textContent = `Avatar file not found. Checked: ${candidateFiles.join(" | ")}`;
    }
    return;
  }

  if (status && window.location.protocol === "file:") {
    status.textContent = `Using local file mode. If loading fails, run a local server and open /web-interface/index.html via http://localhost.`;
  }

  if (!canvas) {
    if (status) {
      status.textContent = "Canvas element not found.";
    }
    return;
  }

  try {
    const riveModule = await import("https://esm.sh/@rive-app/canvas@2.31.4");
    const Rive = riveModule.Rive ?? riveModule.default?.Rive ?? riveModule.default;
    const Layout = riveModule.Layout ?? riveModule.default?.Layout;
    const Fit = riveModule.Fit ?? riveModule.default?.Fit;
    const Alignment = riveModule.Alignment ?? riveModule.default?.Alignment;

    const baseConfig = {
      src,
      canvas,
      autoplay: true,
      layout: new Layout({
        fit: Fit.Contain,
        alignment: Alignment.Center,
      }),
      onLoad: () => {
        if (status) {
          status.textContent = `Avatar loaded: ${src}`;
        }
      },
    };

    try {
      riveInstance = new Rive({
        ...baseConfig,
        stateMachines: "State Machine 1",
      });
    } catch (_) {
      // Fallback for .riv files that don't expose this state machine name.
      riveInstance = new Rive(baseConfig);
      if (status) {
        status.textContent = `Avatar loaded without state machine: ${src}`;
      }
    }

    // Ensure the backing canvas resolution matches CSS size/device pixel ratio.
    const resizeRiveCanvas = () => {
      try {
        riveInstance?.resizeDrawingSurfaceToCanvas();
      } catch (_) {
        // Ignore transient resize errors.
      }
    };

    resizeRiveCanvas();
    window.addEventListener("resize", resizeRiveCanvas);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (status) {
      status.textContent = `Avatar failed to load: ${message}`;
    }
    console.error("Rive initialization error:", error);
  }
}

buildAvatarPage();