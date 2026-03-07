# Think
> Made by [Max Zhang](https://github.com/Maxh119Z/) and [Akshun Chinara](https://github.com/pikull/) at [Stang Hacks 2026](https://www.stanghacks.com/)

## How It Works

4. GPT-4o-mini classifies your prompt across:
   - **Intent** — homework, brainstorming, concept help, direct answer, etc.
   - **Mental risk** — low / medium / high
   - **Subject** — calculus, english, biology, etc.
   - **How to intervene** — allow, hint, nudge, or cooldown
6. Your profile builds dynamically, so if you put something important, it will save that information. Like working on Physics lab, etc.
7. Dashboard shows usage metrics, category breakdowns, and your knowledge to edit


### Web Dashboard

```bash
cd web
npm install -g firebase-tools
firebase login
firebase init hosting     # Select existing project: stanghacks
firebase deploy
```

## Project Structure

```
stanghacks/
├── extension/
│   ├── manifest.json          # MV3 with identity permission
│   ├── firebase-config.js     # ← Put your Google Client ID here
│   ├── auth.js                # Google OAuth via chrome.identity
│   ├── db.js                  # Firestore REST API
│   ├── background.js          # Classification + Firebase sync
│   ├── config.js              # Site selectors (ChatGPT/Claude/Gemini)
│   ├── content.js             # Prompt interception + overlay
│   ├── overlay.css
│   ├── popup.html/js          # Extension popup
│   ├── onboarding.html/js     # First-time profile setup
│   ├── dashboard.html/js      # Full stats dashboard
│   └── icons/
├── web/
│   ├── public/index.html      # Firebase-hosted dashboard
│   └── firebase.json
├── .gitignore
└── README.md
```

## Firestore Structure

```
users/{uid}
  ├── email, displayName, photoUrl
  ├── classes: ["AP Calc BC", "AP English Lit", ...]
  ├── difficulty: "ap_honors"
  ├── sensitivity: 2
  ├── dynamicKnowledge:        ← auto-builds from usage
  │   └── calculus: { promptCount: 14, topics: [...] }
  ├── createdAt, lastActive

users/{uid}/prompts/{id}
  ├── text, intentCategory, outsourcingRisk
  ├── confidence, subject, intervention, site, timestamp

users/{uid}/dailyStats/{YYYY-MM-DD}
  ├── total, nudged, allowed, sentAnyway, triedFirst
  ├── categories: { direct_answer: 6, ... }
  └── subjects: { calculus: 8, ... }
```

## Key Design Decisions

- **OpenAI key stays local** — never sent to Firebase, only in `chrome.storage.sync`
- **Classification runs async** — nudge shows immediately, Firebase sync happens in background
- **Fails open** — if classification fails, prompt goes through (never blocks you from working)
- **5-second cooldown** — not punishing, just enough to make you pause and think

## Supported Sites

- ChatGPT (chatgpt.com)
- Claude (claude.ai)
- Gemini (gemini.google.com)

Adding a new site in `config.js`.

## Cost

GPT-4o-mini: ~$0.0001 per classification (10,000 prompts ≈ $1)
