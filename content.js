// Website Dark Mode — color inversion only, no font/size changes.
// The whole page is inverted with a hue-rotate so colors look natural in dark.
// Real images/videos are re-inverted back so photos still look correct.
//
// Decision per page:
//   1. The site has its own setting ("on" / "off")  -> use it.
//   2. Otherwise, if Auto mode is on                 -> darken only if the page is light.
//   3. Otherwise                                     -> leave the page alone.

(() => {
  if (window.__websiteDarkModeLoaded) return; // guard against double injection
  window.__websiteDarkModeLoaded = true;

  const STYLE_ID = "website-dark-mode-style";
  const HOST = location.hostname;

  const DARK_CSS = `
    html {
      filter: invert(1) hue-rotate(180deg) !important;
      background: #1a1a1a !important;
    }
    /* Restore real media so photos/logos aren't inverted */
    img,
    video,
    iframe,
    [style*="background-image"] {
      filter: invert(1) hue-rotate(180deg) !important;
    }
  `;

  let settings = { autoMode: false, siteMode: null }; // siteMode: "on" | "off" | null
  let reason = "off"; // "site" | "auto" | "auto-already-dark" | "off"

  // ---------- applying the filter ----------

  function isActive() {
    return Boolean(document.getElementById(STYLE_ID));
  }

  function enableDark() {
    if (isActive()) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = DARK_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function disableDark() {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  function setDark(on, why) {
    reason = why;
    if (on) enableDark();
    else disableDark();
    try {
      chrome.runtime.sendMessage({ type: "STATE", active: on, reason: why }).catch(() => {});
    } catch (_) {
      /* extension was reloaded; ignore */
    }
  }

  // ---------- detecting whether the page is already dark ----------

  function parseColor(str) {
    const m = str && str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function luminance({ r, g, b }) {
    const ch = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  }

  // Background color actually visible behind an element (first opaque one going up).
  function effectiveBackground(el) {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a >= 0.5) return c;
    }
    // Nothing opaque: the browser canvas shows through. It is dark only if the
    // page opted into a dark color-scheme.
    const scheme = getComputedStyle(document.documentElement).colorScheme || "";
    return /^\s*dark/.test(scheme) ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  }

  function isPageLight() {
    if (!document.body) return null; // can't tell yet
    const w = window.innerWidth;
    const h = window.innerHeight;
    let light = 0;
    let total = 0;
    for (const fx of [0.2, 0.5, 0.8]) {
      for (const fy of [0.2, 0.5, 0.8]) {
        const el = document.elementFromPoint(w * fx, h * fy);
        if (!el || el.id === STYLE_ID) continue;
        total++;
        if (luminance(effectiveBackground(el)) > 0.4) light++;
      }
    }
    if (total === 0) {
      total = 1;
      light = luminance(effectiveBackground(document.body)) > 0.4 ? 1 : 0;
    }

    // Text color is a strong hint too: light text means a dark theme.
    const text = parseColor(getComputedStyle(document.body).color);
    const textIsLight = text && luminance(text) > 0.5;

    return light / total >= 0.5 && !textIsLight;
  }

  // ---------- deciding ----------

  function decide() {
    if (settings.siteMode === "on") return setDark(true, "site");
    if (settings.siteMode === "off") return setDark(false, "site");
    if (!settings.autoMode) return setDark(false, "off");

    // Auto mode: measure the page (our filter doesn't change computed colors).
    const light = isPageLight();
    if (light === null) return; // body not ready; a later check will run
    setDark(light, light ? "auto" : "auto-already-dark");
  }

  function loadSettings(cb) {
    chrome.storage.local.get({ autoMode: false, sites: {} }, (data) => {
      settings.autoMode = Boolean(data.autoMode);
      settings.siteMode = data.sites[HOST] || null;
      cb && cb();
    });
  }

  // Re-check a few times while the page builds (many sites paint their theme late).
  function scheduleChecks() {
    const run = () => decide();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
    window.addEventListener("load", () => {
      run();
      setTimeout(run, 1500);
    }, { once: true });

    // Sites that follow the OS theme may switch on their own.
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => setTimeout(run, 300));
  }

  loadSettings(() => {
    // Apply forced-on sites right away (document_start) to avoid a white flash.
    if (settings.siteMode === "on") setDark(true, "site");
    scheduleChecks();
  });

  // React instantly when the popup (or another tab) changes settings.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.autoMode || changes.sites) loadSettings(decide);
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === "GET_STATE") {
      sendResponse({
        host: HOST,
        active: isActive(),
        reason,
        siteMode: settings.siteMode,
        autoMode: settings.autoMode,
      });
    }
  });
})();
