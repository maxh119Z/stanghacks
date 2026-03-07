// Site-specific selectors for each AI platform
// To add a new site: add an entry here with the right CSS selectors
const SITE_CONFIGS = {
  "chatgpt.com": {
    name: "ChatGPT",
    // The main textarea / contenteditable where user types
    inputSelector: "#prompt-textarea",
    // The send button
    sendButtonSelector: 'button[data-testid="send-button"]',
    // How to extract text from the input
    getInputText: (el) => el.innerText.trim(),
    // How to detect the form wrapper (to intercept submit)
    formSelector: 'form',
  },
  "chat.openai.com": {
    name: "ChatGPT",
    inputSelector: "#prompt-textarea",
    sendButtonSelector: 'button[data-testid="send-button"]',
    getInputText: (el) => el.innerText.trim(),
    formSelector: 'form',
  },
  "claude.ai": {
    name: "Claude",
    inputSelector: '[contenteditable="true"].ProseMirror',
    sendButtonSelector: 'button[aria-label="Send Message"]',
    getInputText: (el) => el.innerText.trim(),
    formSelector: 'fieldset',
  },
  "gemini.google.com": {
    name: "Gemini",
    inputSelector: '.ql-editor, [contenteditable="true"]',
    sendButtonSelector: 'button.send-button, button[aria-label="Send message"]',
    getInputText: (el) => el.innerText.trim(),
    formSelector: 'form',
  },
};

// Detect current site
function getCurrentSiteConfig() {
  const hostname = window.location.hostname.replace("www.", "");
  return SITE_CONFIGS[hostname] || null;
}
