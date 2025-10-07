document.addEventListener("DOMContentLoaded", function () {
  try {
    const html = document.documentElement;
    const cssFontFamilyVar = "--font-family";
    const roboto =
      getComputedStyle(html).getPropertyValue(cssFontFamilyVar).trim() ||
      "Roboto, Helvetica, sans-serif";

    const cssFontSizeVar = "--font-size";
    const cssFontSize =
      getComputedStyle(html).getPropertyValue(cssFontSizeVar).trim() || "256pt";

    const body = document.body;
    body.style.fontFamily = roboto;

    const getId = (id) => document.getElementById(id);

    const container = getId("titleCounterContainerId");
    const counter = getId("titleCounterId");

    if (!container || !counter) {
      console.error(
        "DOM Elemente fehlen: titleCounterContainerId oder titleCounterId nicht gefunden."
      );
      return;
    }

    [container, counter].forEach((el) => {
      el.style.fontFamily = roboto;
      el.style.webkitUserSelect = "none";
      el.style.userSelect = "none";
      el.style.cursor = "default";
      el.style.pointerEvents = "none";
      el.style.transformOrigin = "center center";
    });

    counter.style.fontSize = cssFontSize;
    counter.textContent = "";

    const params = new URLSearchParams(window.location.search);
    const address = params.get("address") || "127.0.0.1";
    const port = parseInt(params.get("port") || "8080", 10);
    const password = params.get("password") || "";
    const durationMinutes = Math.max(
      0,
      parseFloat(params.get("duration") || "5")
    );
    const actionName = params.get("action") || "";
    const actionId = params.get("actionId") || "";

    const paddingPercent = parseFloat(params.get("paddingPercent") || "0.96");
    const maxScale = parseFloat(params.get("maxScale") || "1");
    const tickMs = parseInt(params.get("tickMs") || "1", 10);

    const durationMs = Math.max(0, Math.round(durationMinutes * 60 * 1000));

    let client = null;
    if (typeof window.StreamerbotClient !== "undefined") {
      try {
        client = new window.StreamerbotClient({
          host: address,
          port: port,
          endpoint: "/",
          password: password,
        });
        client.on("connect", () =>
          console.info("Streamer.bot Client: connected")
        );
        client.on("disconnect", () =>
          console.warn("Streamer.bot Client: disconnected")
        );
      } catch (e) {
        console.warn("Streamer.bot client init failed:", e);
        client = null;
      }
    } else {
      console.info(
        "StreamerbotClient nicht gefunden (falls benötigt, <script> einbinden)."
      );
    }

    async function executeStreamerBotAction({
      actionId: id,
      actionName: name,
    }) {
      if (!client) return { ok: false, error: "no-client" };
      try {
        if (id) {
          const res = await client.doAction(id);
          return { ok: true, res };
        }
        if (name) {
          const list = await client.getActions();
          const actionsList = list.actions || list;
          const found = (actionsList || []).find?.(
            (a) => (a.name || a).toLowerCase?.() === name.toLowerCase?.()
          );
          if (found) {
            const idToCall =
              found.id || found.actionId || found.guid || found._id;
            const res = await client.doAction(idToCall);
            return { ok: true, res };
          } else return { ok: false, error: "not-found" };
        }
        return { ok: false, error: "no-action-specified" };
      } catch (err) {
        console.error("Action error:", err);
        return { ok: false, error: err?.message || err };
      }
    }

    function formatMsToMMSSMMM(ms) {
      const totalMs = Math.max(0, Math.round(ms));
      const minutes = Math.floor(totalMs / 60000);
      const seconds = Math.floor((totalMs % 60000) / 1000);
      const milliseconds = totalMs % 1000;

      const mm = String(minutes).padStart(2, "0");
      const ss = String(seconds).padStart(2, "0");
      const mmm = String(milliseconds).padStart(3, "0");

      return `${mm}:${ss}:${mmm}`;
    }

    function measureTextRect(sampleText) {
      const clone = counter.cloneNode(true);
      clone.style.visibility = "hidden";
      clone.style.position = "absolute";
      clone.style.left = "-9999px";
      clone.style.top = "-9999px";
      clone.style.transform = "none";
      clone.style.whiteSpace = "nowrap";
      clone.textContent = sampleText;
      document.body.appendChild(clone);
      const r = clone.getBoundingClientRect();
      document.body.removeChild(clone);
      return r;
    }

    function resizeToFit(sampleText) {
      const contRect = container.getBoundingClientRect();
      if (contRect.width <= 0 || contRect.height <= 0) {
        return false;
      }
      const textRect = measureTextRect(sampleText);

      const availableW =
        contRect.width * Math.max(0, Math.min(1, paddingPercent));
      const availableH =
        contRect.height * Math.max(0, Math.min(1, paddingPercent));

      const scaleX = textRect.width > 0 ? availableW / textRect.width : 1;
      const scaleY = textRect.height > 0 ? availableH / textRect.height : 1;
      let scale = Math.min(scaleX, scaleY);

      scale = Math.min(scale, 1, maxScale);

      counter.style.transform = `scale(${scale})`;
      return true;
    }

    function debounce(fn, wait = 80) {
      let t = null;
      return (...args) => {
        if (t) clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
      };
    }

    function ensureResize(sampleText = "") {
      let attempts = 0;
      const maxAttempts = 10;
      const tryResize = () => {
        attempts++;
        const ok = resizeToFit(sampleText);
        if (!ok && attempts < maxAttempts) {
          setTimeout(tryResize, 120);
        }
      };
      tryResize();
    }

    let remainingMs = durationMs;
    let intervalId = null;

    function render(msValue) {
      if (msValue === "" || msValue == null) {
        counter.textContent = "";
        ensureResize("");
        return;
      }
      const formatted = formatMsToMMSSMMM(msValue);
      counter.textContent = formatted;
      resizeToFit(formatted);
    }

    async function triggerSwitch() {
      try {
        await executeStreamerBotAction({
          actionId: actionId || null,
          actionName: actionName || null,
        });
      } catch (e) {
        console.error("triggerSwitch:", e);
      } finally {
        render("");
      }
    }

    function startCountdown() {
      if (remainingMs <= 0) {
        render("");
        setTimeout(() => triggerSwitch(), 0);
        return;
      }
      render(remainingMs);
      intervalId = setInterval(() => {
        remainingMs -= tickMs;
        if (remainingMs > 0) {
          render(remainingMs);
        } else {
          clearInterval(intervalId);
          intervalId = null;
          render("");
          setTimeout(() => triggerSwitch(), 0);
        }
      }, tickMs);
    }

    const ro = new (window.ResizeObserver ||
      function () {
        return { observe: () => {}, disconnect: () => {} };
      })((entries) => {
      const cur = counter.textContent.trim() || "";
      resizeToFit(cur);
    });
    try {
      ro.observe(container);
    } catch (e) {}

    const mo = new MutationObserver(
      debounce(() => {
        const cur = counter.textContent.trim() || "";
        resizeToFit(cur);
      }, 30)
    );
    mo.observe(counter, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    window.addEventListener(
      "resize",
      debounce(() => {
        const cur = counter.textContent.trim() || "";
        resizeToFit(cur);
      }, 80)
    );

    ensureResize("");

    startCountdown();

    window.__obsAutoSwitcher = {
      client,
      triggerSwitch,
      startCountdown: () => {
        if (intervalId) return;
        remainingMs = durationMs;
        startCountdown();
      },
      stopCountdown: () => {
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
      },
      getRemainingMs: () => Math.max(0, remainingMs),
      durationMs,
    };
  } catch (err) {
    console.error("Init Error:", err);
  }
});
