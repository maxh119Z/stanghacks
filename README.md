# brainguard

**Like screentime, but for your brain.**

A Chrome extension that intercepts your AI prompts and nudges you to think first. Uses Google Sign-In + Firebase for cross-device sync.

## How It Works

1. Install the extension, sign in with Google
2. First-time users get an onboarding page to enter their classes and difficulty level
3. When you prompt ChatGPT, Claude, or Gemini, BrainGuard intercepts it
4. GPT-4o-mini classifies your prompt across multiple dimensions:
   - **Intent** — homework, brainstorming, concept help, direct answer, etc.
   - **Outsourcing risk** — low / medium / high
   - **Subject** — calculus, english, biology, etc.
   - **Intervention** — allow, hint, nudge, or cooldown
5. Low-risk prompts pass silently. Higher-risk prompts show a nudge overlay with a hint and a 5-second cooldown
6. Your profile builds dynamically — BrainGuard learns what topics you ask about
7. Dashboard shows usage metrics, category breakdowns, and your knowledge map

## Setup

### 1. Firebase (you already have this)

In the Firebase Console for `stanghacks`:
- **Authentication** → Sign-in method → Enable **Google**
- Note the **Web client ID** (under Google provider → Web SDK configuration)
- **Firestore** → Create database → Start in test mode

### 2. Google OAuth Client ID (IMPORTANT)

This is the one thing you need to configure:

1. Go to [Google Cloud Console](https://console.cloud.google.com) → Select `stanghacks` project
2. APIs & Services → Credentials
3. Find the **Web client** auto-created by Firebase (or create one)
4. Under "Authorized redirect URIs", add:
   ```
   https://<YOUR_EXTENSION_ID>.chromiumapp.org/
   ```
   (Get your extension ID from `chrome://extensions` after loading it)
5. Copy the **Client ID** (looks like `1234567890-abc.apps.googleusercontent.com`)
6. Paste it into `extension/firebase-config.js` → `GOOGLE_CLIENT_ID`

### 3. Load Extension

1. Open `chrome://extensions` → Enable Developer mode
2. Click **Load unpacked** → Select the `extension/` folder
3. Copy the extension ID, add it to the OAuth redirect URIs (step 2.4)
4. Click 🧠 icon → Enter your OpenAI API key → Save
5. Click "Sign in with Google" → Complete onboarding

### 4. Web Dashboard (optional)

```bash
cd web
npm install -g firebase-tools
firebase login
firebase init hosting     # Select existing project: stanghacks
firebase deploy
```

## Project Structure

```
brainguard/
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

## Auth Flow

```
Click "Sign in with Google"
  → chrome.identity.launchWebAuthFlow (Google OAuth popup)
  → Get Google id_token
  → Exchange for Firebase Auth via REST API
  → Store Firebase token in chrome.storage
  → Check if profile exists in Firestore
    → New user: open onboarding.html (enter classes, difficulty)
    → Existing user: ready to go
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

## Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Key Design Decisions

- **OpenAI key stays local** — never sent to Firebase, only in `chrome.storage.sync`
- **Google Sign-In via `chrome.identity`** — native Chrome OAuth flow, no SDK bloat in extension
- **Firebase via REST API** — no heavy SDK in background worker
- **Classification runs async** — nudge shows immediately, Firebase sync happens in background
- **Fails open** — if classification fails, prompt goes through (never blocks you from working)
- **5-second cooldown** — not punishing, just enough to make you pause and think

## Supported Sites

- ChatGPT (chatgpt.com)
- Claude (claude.ai)
- Gemini (gemini.google.com)

Adding a new site = ~10 lines in `config.js`.

## Cost

GPT-4o-mini: ~$0.0001 per classification (10,000 prompts ≈ $1)