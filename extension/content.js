// BrainGuard Content Script
// Intercepts AI prompts and classifies them before sending

(function () {
  "use strict";

  const config = getCurrentSiteConfig();
  if (!config) return; // Not on a supported site

  console.log(`[BrainGuard] Active on ${config.name}`);

  let isProcessing = false;
  let bypassNext = false;
  let sessionStats = { total: 0, blocked: 0, allowed: 0, categories: {} };

  // ── Overlay UI ──────────────────────────────────────────────

  function createOverlay(classification, promptText) {
    removeOverlay(); // clean up any existing

    const overlay = document.createElement("div");
    overlay.id = "brainguard-overlay";

    const card = document.createElement("div");
    card.id = "brainguard-card";

    const emoji = getEmoji(classification.category);
    const color = getColor(classification.level);

    card.innerHTML = `
      <div class="bg-header" style="background: ${color}">
        <span class="bg-emoji">${emoji}</span>
        <span class="bg-category">${classification.category.replace(/_/g, " ")}</span>
        <span class="bg-level">Level: ${classification.level}/5</span>
      </div>
      <div class="bg-body">
        <p class="bg-message">${classification.message}</p>
        ${classification.hint ? `<div class="bg-hint"><strong>💡 Hint:</strong> ${classification.hint}</div>` : ""}
        <div class="bg-prompt-preview">"${truncate(promptText, 100)}"</div>
        <div class="bg-actions">
          <button id="bg-try-first" class="bg-btn bg-btn-primary">I'll try first ✊</button>
          <button id="bg-send-anyway" class="bg-btn bg-btn-secondary">Send anyway →</button>
        </div>
        <div class="bg-stats">
          Today: ${sessionStats.total} prompts · ${sessionStats.blocked} nudged · ${sessionStats.allowed} sent freely
        </div>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => overlay.classList.add("visible"));

    document.getElementById("bg-try-first").addEventListener("click", () => {
      removeOverlay();
    });

    document.getElementById("bg-send-anyway").addEventListener("click", () => {
      removeOverlay();
      bypassNext = true;
      clickSend();
    });

    // Close on Escape
    const escHandler = (e) => {
      if (e.key === "Escape") {
        removeOverlay();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);
  }

  function removeOverlay() {
    const existing = document.getElementById("brainguard-overlay");
    if (existing) existing.remove();
  }

  function getEmoji(category) {
    const map = {
      direct_answer: "🤦",
      homework_completion: "📝",
      concept_clarification: "🤔",
      brainstorming: "💡",
      editing_polishing: "✨",
      advanced_help: "🚀",
      casual_chat: "💬",
    };
    return map[category] || "🧠";
  }

  function getColor(level) {
    if (level <= 1) return "linear-gradient(135deg, #10b981, #059669)";
    if (level <= 2) return "linear-gradient(135deg, #3b82f6, #2563eb)";
    if (level <= 3) return "linear-gradient(135deg, #f59e0b, #d97706)";
    if (level <= 4) return "linear-gradient(135deg, #f97316, #ea580c)";
    return "linear-gradient(135deg, #ef4444, #dc2626)";
  }

  function truncate(str, len) {
    return str.length > len ? str.slice(0, len) + "…" : str;
  }

  // ── Prompt Interception ─────────────────────────────────────

  function getPromptText() {
    const input = document.querySelector(config.inputSelector);
    if (!input) return "";
    return config.getInputText(input);
  }

  function clickSend() {
    const btn = document.querySelector(config.sendButtonSelector);
    if (btn) btn.click();
  }

  async function classifyPrompt(text) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "CLASSIFY_PROMPT", prompt: text },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  async function handlePromptSubmit(e) {
    if (bypassNext) {
      bypassNext = false;
      return; // Let it through
    }

    const text = getPromptText();
    if (!text || text.length < 10) return; // Too short to classify
    if (isProcessing) return;

    // Block the submission
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    isProcessing = true;

    try {
      const result = await classifyPrompt(text);

      if (result.error) {
        // If classification fails (no API key, etc.), let it through
        console.warn("[BrainGuard]", result.error);
        bypassNext = true;
        clickSend();
        return;
      }

      sessionStats.total++;
      const cat = result.category;
      sessionStats.categories[cat] = (sessionStats.categories[cat] || 0) + 1;

      // Level 1-2 = fine, let it through. 3+ = nudge.
      if (result.level <= 2) {
        sessionStats.allowed++;
        bypassNext = true;
        clickSend();
      } else {
        sessionStats.blocked++;
        createOverlay(result, text);
      }

      // Save stats
      chrome.storage.local.set({ sessionStats });
    } catch (err) {
      console.error("[BrainGuard] Classification error:", err);
      // Fail open - let the prompt through
      bypassNext = true;
      clickSend();
    } finally {
      isProcessing = false;
    }
  }

  // ── Event Binding ───────────────────────────────────────────

  function attachListeners() {
    // Intercept form submit
    const form = document.querySelector(config.formSelector);
    if (form && !form.dataset.bgBound) {
      form.addEventListener("submit", handlePromptSubmit, true);
      form.dataset.bgBound = "true";
      console.log("[BrainGuard] Bound to form submit");
    }

    // Intercept send button click
    const sendBtn = document.querySelector(config.sendButtonSelector);
    if (sendBtn && !sendBtn.dataset.bgBound) {
      sendBtn.addEventListener("click", handlePromptSubmit, true);
      sendBtn.dataset.bgBound = "true";
      console.log("[BrainGuard] Bound to send button");
    }

    // Intercept Enter key in input
    const input = document.querySelector(config.inputSelector);
    if (input && !input.dataset.bgBound) {
      input.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            handlePromptSubmit(e);
          }
        },
        true
      );
      input.dataset.bgBound = "true";
      console.log("[BrainGuard] Bound to input Enter key");
    }
  }

  // ChatGPT is an SPA - elements get recreated, so we re-bind periodically
  const observer = new MutationObserver(() => {
    attachListeners();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  attachListeners();

  // Also try every 2s as a fallback
  setInterval(attachListeners, 2000);

  // Load saved stats
  chrome.storage.local.get("sessionStats", (data) => {
    if (data.sessionStats) sessionStats = data.sessionStats;
  });

  console.log("[BrainGuard] Content script loaded ✓");
})();
