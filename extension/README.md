# 🧠 BrainGuard — AI Dependency Monitor

**Like screentime, but for your brain.**

A Chrome extension that monitors your AI prompts and nudges you to think first. It classifies each prompt you send to ChatGPT (and Claude/Gemini) and decides whether you should try solving it yourself.

## Quick Setup

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked** → select this `brainrot-guard` folder
4. Click the 🧠 BrainGuard icon in your toolbar
5. Paste your **OpenAI API key** (get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys))
6. Enter your classes (e.g., "AP Calc BC, AP English, Physics")
7. Save and start prompting!

## How It Works

```
You type a prompt → BrainGuard intercepts it → Classifies via GPT-4o-mini
                                                      ↓
                                              Level 1-2: Sends through ✅
                                              Level 3-5: Shows nudge overlay 🤔
                                                      ↓
                                              "I'll try first" or "Send anyway"
```

## Prompt Categories

| Category | Example | Typical Level |
|----------|---------|---------------|
| Direct Answer | "What's the capital of France?" | 4-5 |
| Homework Completion | "Write my essay on WW2" | 4-5 |
| Concept Clarification | "Explain derivatives intuitively" | 1-2 |
| Brainstorming | "Ideas for my history project?" | 1-2 |
| Editing/Polishing | "Proofread my paragraph" | 2-3 |
| Advanced Help | "Debug this recursive function" | 1-2 |

## Supported Sites

- ✅ ChatGPT (chatgpt.com)
- ✅ Claude (claude.ai)
- ✅ Gemini (gemini.google.com)

Adding a new site = adding ~10 lines to `config.js`.

## Cost

Uses `gpt-4o-mini` — roughly **$0.0001 per classification** (10,000 prompts ≈ $1).

## Project Structure

```
brainrot-guard/
├── manifest.json     # Chrome extension config (MV3)
├── config.js         # Site selectors — add new AI sites here
├── content.js        # Injected into AI sites, intercepts prompts
├── background.js     # Service worker, calls OpenAI API
├── overlay.css       # Nudge overlay styling
├── popup.html        # Settings popup UI
├── popup.js          # Settings logic
└── icons/
    ├── icon48.png
    └── icon128.png
```

## Next Steps (hackathon ideas)

- [ ] Firebase backend for persistent profile + cross-device sync
- [ ] Dashboard web app with charts (prompts over time, categories, improvement)
- [ ] Adaptive profile that learns what you know vs. don't know
- [ ] "Streak" system — reward days with zero lazy prompts
- [ ] Peer comparison (opt-in) — class-level anonymized stats
- [ ] Teacher mode — see aggregate class dependency patterns
