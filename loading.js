/**
 * PixStar
 * File        : loading.js
 * Description : Boot / loading screen. No external framework or library.
 *
 * This script drives the real app boot sequence:
 * - Starts loading every real resource in parallel immediately (style.css,
 *   the 3 logo images, the Material Symbols font, app.bundle.js — the full
 *   app code — and jszip, used for Export/Import).
 * - app.bundle.js and jszip are injected into the page dynamically from
 *   here (instead of a static <script> tag at the end of body) so the
 *   real onload event can be captured and the loading bar timed off it.
 * - Each pixel block on the loading bar only fills in once its
 *   corresponding file has actually finished loading — there is no
 *   simulated progress from setTimeout.
 */

(function () {
  "use strict";

  // ============================================================
  // Constants
  // ============================================================
  const HOLD_BEFORE_FADE = 260;   // ms to hold at 100% before starting the fade out
  const MIN_ITEM_VISIBLE = 140;   // ms minimum a filename stays on screen (avoids flicker)
  const FONT_TIMEOUT = 3000;      // ms max wait for the font to arrive before moving on
  const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

  // ============================================================
  // Utility Functions
  // Real per-resource loaders. Each one always resolves (even on error)
  // so the loading screen never gets stuck, but the resource itself is
  // still fetched from the network/disk for real — never simulated.
  // ============================================================
  function loadFetch(url) {
    return fetch(url, { cache: "default" }).then((res) => res.blob()).catch(() => null);
  }

  function loadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    });
  }

  function loadFont() {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };

      if (document.fonts && document.fonts.load) {
        document.fonts.load('24px "Material Symbols Outlined"').then(finish).catch(finish);
      } else {
        const link = document.getElementById("font-material-symbols");
        if (link) {
          link.addEventListener("load", finish, { once: true });
          link.addEventListener("error", finish, { once: true });
        } else {
          finish();
        }
      }

      // Guards against a slow or blocked network stalling the whole boot sequence.
      window.setTimeout(finish, FONT_TIMEOUT);
    });
  }

  function loadScript(url, elementId) {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = url;
      if (elementId) script.id = elementId;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.body.appendChild(script);
    });
  }

  function checkLocalStorage() {
    return new Promise((resolve) => {
      try {
        const key = "__pixstar_boot_check__";
        window.localStorage.setItem(key, "1");
        window.localStorage.removeItem(key);
      } catch (err) {
        // No access to localStorage (e.g. private browsing) — still fine to continue.
      }
      resolve();
    });
  }

  function waitWindowLoad() {
    return new Promise((resolve) => {
      if (document.readyState === "complete") {
        resolve();
      } else {
        window.addEventListener("load", () => resolve(), { once: true });
      }
    });
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  // ============================================================
  // Global Variables
  // Kick off every real resource load "immediately, in parallel" from this
  // point on (so the browser can work at full parallel throughput instead
  // of loading one at a time). The bar below only checks/renders progress
  // in the order it was designed to show.
  // ============================================================
  const jobs = {
    init:      checkLocalStorage(),
    stylesheet: loadFetch("style.css"),
    logoApp:   loadImage("images/logo/pixstar-logo-app.png"),
    logoDark:  loadImage("images/logo/pixstar-logo-dark.png"),
    logoLight: loadImage("images/logo/pixstar-logo-light.png"),
    font:      loadFont(),
    bundle:    loadScript("app.bundle.js", "app-bundle-script"),
    jszip:     loadScript(JSZIP_URL, "jszip-script"),
    windowLoad: waitWindowLoad(),
  };

  // Display order on the loading bar (1 item = 1 block).
  const PHASES = [
    {
      message: "กำลังเริ่มต้น...",
      items: [{ job: "init", label: "ตรวจสอบระบบ" }],
    },
    {
      message: "กำลังโหลดทรัพยากร...",
      items: [{ job: "stylesheet", label: "style.css" }],
    },
    {
      message: "กำลังโหลดไอคอน...",
      items: [
        { job: "logoApp", label: "pixstar-logo-app.png" },
        { job: "logoDark", label: "pixstar-logo-dark.png" },
        { job: "logoLight", label: "pixstar-logo-light.png" },
      ],
    },
    {
      message: "กำลังโหลดฟอนต์...",
      items: [{ job: "font", label: "Material Symbols Outlined" }],
    },
    {
      message: "กำลังเตรียมพื้นที่ทำงาน...",
      items: [{ job: "bundle", label: "app.bundle.js" }],
    },
    {
      message: "กำลังเตรียมเครื่องมือ...",
      items: [{ job: "jszip", label: "jszip.min.js" }],
    },
    {
      message: "ใกล้พร้อมใช้งาน...",
      items: [{ job: "windowLoad", label: "กำลังซิงค์หน้าจอ" }],
    },
  ];

  const TOTAL_ITEMS = PHASES.reduce((sum, phase) => sum + phase.items.length, 0);

  // ============================================================
  // DOM References
  // ============================================================
  const loadingScreen = document.getElementById("loading-screen");
  const pixelBar = document.getElementById("pixel-bar");
  const statusEl = document.getElementById("loading-status");
  const fileEl = document.getElementById("loading-file");

  // Build the loading-bar blocks to match the real item count.
  const blocks = [];
  for (let i = 0; i < TOTAL_ITEMS; i++) {
    const block = document.createElement("div");
    block.className = "pixel-block";
    pixelBar.appendChild(block);
    blocks.push(block);
  }

  // ============================================================
  // Core Functions
  // ============================================================
  function renderProgress(completedCount) {
    blocks.forEach((block, index) => {
      const isFilled = index < completedCount;
      block.classList.toggle("filled", isFilled);
      block.classList.remove("active");
    });

    if (completedCount > 0 && completedCount <= TOTAL_ITEMS) {
      blocks[completedCount - 1].classList.add("active");
    }

    const percent = Math.round((completedCount / TOTAL_ITEMS) * 100);
    pixelBar.setAttribute("aria-valuenow", String(percent));
  }

  function setText(el, text) {
    if (el.textContent === text) return Promise.resolve();
    el.classList.add("status-fade");
    return new Promise((resolve) => {
      window.setTimeout(() => {
        el.textContent = text;
        el.classList.remove("status-fade");
        resolve();
      }, 160);
    });
  }

  // Runs the display sequence — each item waits for its real job promise to
  // resolve before its block fills in, even though all jobs already started
  // in parallel above.
  async function runLoadingSequence() {
    let completedCount = 0;
    renderProgress(0);

    for (const phase of PHASES) {
      await setText(statusEl, phase.message);

      for (const item of phase.items) {
        await setText(fileEl, item.label);
        await Promise.all([jobs[item.job], wait(MIN_ITEM_VISIBLE)]);
        completedCount += 1;
        renderProgress(completedCount);
      }
    }

    await setText(statusEl, "เสร็จสิ้น");
    await setText(fileEl, "");
    await wait(HOLD_BEFORE_FADE);
    revealApp();
  }

  // Fades out the loading screen to reveal the real app underneath.
  function revealApp() {
    loadingScreen.classList.add("fade-out");
    loadingScreen.addEventListener(
      "transitionend",
      () => { loadingScreen.hidden = true; },
      { once: true }
    );
  }

  runLoadingSequence();
})();
