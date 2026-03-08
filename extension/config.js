const SITE_CONFIGS = {
  "chatgpt.com": {
    name: "ChatGPT",
    inputSelector: "#prompt-textarea",
    sendButtonSelector: 'button[data-testid="send-button"]',
    getInputText: (el) => el.innerText.trim(),
    getImages: (el) => {
      const container = el.closest("form") || el.parentElement?.parentElement;
      if (!container) return [];
      const imgs = container.querySelectorAll('img[src]:not([alt="User"])');
      return Array.from(imgs).map((img) => img.src).filter((s) => s.startsWith("blob:") || s.startsWith("data:") || s.startsWith("http"));
    },
    formSelector: "form",
  },
  "chat.openai.com": {
    name: "ChatGPT",
    inputSelector: "#prompt-textarea",
    sendButtonSelector: 'button[data-testid="send-button"]',
    getInputText: (el) => el.innerText.trim(),
    getImages: () => [],
    formSelector: "form",
  },
  "claude.ai": {
    name: "Claude",
    inputSelector: '[contenteditable="true"].ProseMirror',
    sendButtonSelector: 'button[aria-label="Send Message"]',
    getInputText: (el) => el.innerText.trim(),
    getImages: (el) => Array.from(el.querySelectorAll("img[src]")).map((i) => i.src),
    formSelector: "fieldset",
  },
  "gemini.google.com": {
    name: "Gemini",
    inputSelector: '.ql-editor, [contenteditable="true"]',
    sendButtonSelector: 'button.send-button, button[aria-label="Send message"]',
    getInputText: (el) => el.innerText.trim(),
    getImages: () => [],
    formSelector: "form",
  },
};

function getCurrentSiteConfig() {
  const hostname = window.location.hostname.replace("www.", "");
  return SITE_CONFIGS[hostname] || null;
}
