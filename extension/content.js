// Think Content Script
(function () {
  "use strict";

  const config = getCurrentSiteConfig();
  if (!config) return;

  console.log(`[Think] Active on ${config.name}`);

  let isProcessing = false;
  let bypassNext = false;
  const COOLDOWN_SECONDS = 5;

  // ── Image Extraction ────────────────────────────────────────

  async function extractImages() {
    const input = document.querySelector(config.inputSelector);
    if (!input) return [];
    const srcs = config.getImages(input);
    const results = [];
    for (const src of srcs) {
      try {
        if (src.startsWith("data:")) { results.push(src); continue; }
        const img = new Image();
        img.crossOrigin = "anonymous";
        const loaded = await new Promise((res, rej) => { img.onload = () => res(img); img.onerror = rej; img.src = src; });
        const c = document.createElement("canvas");
        c.width = Math.min(loaded.width, 800);
        c.height = Math.min(loaded.height, 800);
        c.getContext("2d").drawImage(loaded, 0, 0, c.width, c.height);
        results.push(c.toDataURL("image/jpeg", 0.7));
      } catch (e) { console.warn("[Think] Image extract fail:", e); }
    }
    return results;
  }

  // ── Overlay UI ──────────────────────────────────────────────

  function createOverlay(classification, promptText) {
    removeOverlay();

    const needsCooldown = classification.recommended_intervention === "nudge" || classification.recommended_intervention === "cooldown";
    const overlay = document.createElement("div");
    overlay.id = "think-overlay";

    const emoji = { direct_answer: "\u{1F926}", homework_completion: "\u{1F4DD}", concept_clarification: "\u{1F914}", brainstorming: "\u{1F4A1}", editing_polishing: "\u2728", advanced_help: "\u{1F680}", casual_chat: "\u{1F4AC}" }[classification.intent_category] || "\u{1F9E0}";
    const color = { low: "linear-gradient(135deg,#10b981,#059669)", medium: "linear-gradient(135deg,#f59e0b,#d97706)", high: "linear-gradient(135deg,#ef4444,#dc2626)" }[classification.outsourcing_risk] || "linear-gradient(135deg,#6366f1,#4f46e5)";
    const risk = classification.outsourcing_risk.toUpperCase();
    const trunc = promptText.length > 120 ? promptText.slice(0, 120) + "\u2026" : promptText;

    const card = document.createElement("div");
    card.id = "think-card";
    card.innerHTML = `
      <div class="bg-header" style="background:${color}">
       
        <div class="bg-header-text">
          <span class="bg-category">${classification.intent_category.replace(/_/g, " ")}</span>
          <span class="bg-subject-tag">${classification.subject}</span>
        </div>
        <span class="bg-risk-badge">${risk} RISK</span>
      </div>
      <div class="bg-body">
        <p class="bg-message">${classification.message}</p>
        ${classification.hint ? `<div class="bg-hint"><strong>\u{1F4A1} Hint:</strong> ${classification.hint}</div>` : ""}
        <div class="bg-prompt-preview">"${trunc}"</div>
        <div class="bg-actions">
          <button id="bg-try-first" class="bg-btn bg-btn-primary">I'll try first</button>
          <button id="bg-send-anyway" class="bg-btn bg-btn-secondary" ${needsCooldown ? "disabled" : ""}>
            ${needsCooldown ? `Wait <span id="bg-countdown">${COOLDOWN_SECONDS}</span>s` : "Send anyway"}
          </button>
        </div>
        <div class="bg-meta">
          <span>Confidence: ${Math.round(classification.confidence * 100)}%</span>
          <span>${classification.recommended_intervention}</span>
        </div>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    // Cooldown timer
    if (needsCooldown) {
      let remaining = COOLDOWN_SECONDS;
      const btn = document.getElementById("bg-send-anyway");
      const cd = document.getElementById("bg-countdown");
      const timer = setInterval(() => {
        remaining--;
        if (cd) cd.textContent = remaining;
        if (remaining <= 0) { clearInterval(timer); btn.disabled = false; btn.innerHTML = "Send anyway \u2192"; }
      }, 1000);
    }

    document.getElementById("bg-try-first").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "LOG_ACTION", action: "tried_first" });
      removeOverlay();
    });
    document.getElementById("bg-send-anyway").addEventListener("click", () => {
      if (document.getElementById("bg-send-anyway").disabled) return;
      chrome.runtime.sendMessage({ type: "LOG_ACTION", action: "sent_anyway" });
      removeOverlay();
      bypassNext = true;
      clickSend();
    });

    const escH = (e) => { if (e.key === "Escape") { chrome.runtime.sendMessage({ type: "LOG_ACTION", action: "tried_first" }); removeOverlay(); document.removeEventListener("keydown", escH); } };
    document.addEventListener("keydown", escH);
  }

  function removeOverlay() { const el = document.getElementById("think-overlay"); if (el) el.remove(); }
  function getPromptText() { const el = document.querySelector(config.inputSelector); return el ? config.getInputText(el) : ""; }
  function clickSend() { const btn = document.querySelector(config.sendButtonSelector); if (btn) btn.click(); }

  // ── Prompt Interception ─────────────────────────────────────

  async function handlePromptSubmit(e) {
    if (bypassNext) { bypassNext = false; return; }
    const text = getPromptText();
    if (!text || text.length < 10 || isProcessing) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    isProcessing = true;

    try {
      const images = await extractImages();
      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { type: "CLASSIFY_PROMPT", prompt: text, images, site: window.location.hostname },
          (r) => { if (chrome.runtime.lastError) reject(chrome.runtime.lastError); else resolve(r); }
        );
      });

      if (result.error) { console.warn("[think]", result.error); bypassNext = true; clickSend(); return; }
      if (result.recommended_intervention === "allow") { bypassNext = true; clickSend(); }
      else { createOverlay(result, text); }
    } catch (err) { console.error("[]", err); bypassNext = true; clickSend(); }
    finally { isProcessing = false; }
  }

  // ── Binding ─────────────────────────────────────────────────

  function attach() {
    const form = document.querySelector(config.formSelector);
    if (form && !form.dataset.bg) { form.addEventListener("submit", handlePromptSubmit, true); form.dataset.bg = "1"; }
    const btn = document.querySelector(config.sendButtonSelector);
    if (btn && !btn.dataset.bg) { btn.addEventListener("click", handlePromptSubmit, true); btn.dataset.bg = "1"; }
    const inp = document.querySelector(config.inputSelector);
    if (inp && !inp.dataset.bg) { inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) handlePromptSubmit(e); }, true); inp.dataset.bg = "1"; }
  }

  new MutationObserver(attach).observe(document.body, { childList: true, subtree: true });
  attach();
  setInterval(attach, 2000);
})();
