import { googleSignIn, getValidToken, saveAuthToStorage, signOut } from "./auth.js";
import { getUserProfile, saveUserProfile, logPrompt, getDailyStats, saveDailyStats, updateDynamicProfile } from "./db.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    CLASSIFY_PROMPT: () => handleClassification(message.prompt, message.images, message.site),
    GOOGLE_SIGN_IN: () => handleGoogleSignIn(),
    SIGN_OUT: () => handleSignOut(),
    GET_AUTH: () => getAuthState(),
    GET_PROFILE: () => handleGetProfile(),
    SAVE_PROFILE: () => handleSaveProfile(message.profile),
    SAVE_ONBOARDING: () => handleSaveOnboarding(message.profile),
    GET_STATS: () => handleGetStats(message.days),
    OPEN_PAGE: () => { chrome.tabs.create({ url: chrome.runtime.getURL(message.page) }); return Promise.resolve({ ok: true }); },
    OPEN_WEBSITE: () => { import("./firebase-config.js").then(({ WEBSITE_URL }) => { chrome.tabs.create({ url: WEBSITE_URL }); }); return Promise.resolve({ ok: true }); },
    LOG_ACTION: () => handleLogAction(message.action),
  };
  const handler = handlers[message.type];
  if (handler) { handler().then(sendResponse).catch((e) => sendResponse({ error: e.message })); return true; }
});

async function handleGoogleSignIn() {
  const authData = await googleSignIn();
  await saveAuthToStorage(authData);
  const profile = await getUserProfile(authData.localId, authData.idToken);
  if (!profile || !profile.classes || profile.classes.length === 0) return { ok: true, uid: authData.localId, needsOnboarding: true };
  return { ok: true, uid: authData.localId, needsOnboarding: false };
}

async function handleSignOut() { await signOut(); return { ok: true }; }

async function getAuthState() {
  const stored = await chrome.storage.local.get(["uid", "email", "displayName", "photoUrl"]);
  return { loggedIn: !!stored.uid, uid: stored.uid || null, email: stored.email || null, displayName: stored.displayName || null, photoUrl: stored.photoUrl || null };
}

async function handleSaveOnboarding(profile) {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  const stored = await chrome.storage.local.get(["email", "displayName", "photoUrl"]);
  const fullProfile = { email: stored.email || "", displayName: profile.displayName || stored.displayName || "", photoUrl: stored.photoUrl || "", classes: profile.classes || [], difficulty: profile.difficulty || "high_school", sensitivity: profile.sensitivity || 2, dynamicKnowledge: {}, createdAt: new Date().toISOString(), lastActive: new Date().toISOString() };
  await saveUserProfile(auth.uid, auth.idToken, fullProfile);
  await chrome.storage.sync.set({ sensitivity: fullProfile.sensitivity });
  return { ok: true };
}

async function handleGetProfile() { const auth = await getValidToken(); if (!auth) return { error: "Not logged in" }; const profile = await getUserProfile(auth.uid, auth.idToken); return { profile: profile || {} }; }

async function handleSaveProfile(profile) {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  await saveUserProfile(auth.uid, auth.idToken, { ...profile, lastActive: new Date().toISOString() });
  if (profile.sensitivity) await chrome.storage.sync.set({ sensitivity: profile.sensitivity });
  return { ok: true };
}

async function handleGetStats(days = 7) {
  const auth = await getValidToken();
  if (!auth) { const local = await chrome.storage.local.get("sessionStats"); return { stats: [{ date: todayStr(), ...(local.sessionStats || emptyStats()) }] }; }
  const results = [];
  for (let i = 0; i < days; i++) { const d = new Date(); d.setDate(d.getDate() - i); const ds = d.toISOString().split("T")[0]; const s = await getDailyStats(auth.uid, auth.idToken, ds); results.push({ date: ds, ...(s || emptyStats()) }); }
  return { stats: results };
}

async function handleLogAction(action) {
  const auth = await getValidToken();
  if (auth) { const ds = todayStr(); const stats = (await getDailyStats(auth.uid, auth.idToken, ds)) || emptyStats(); if (action === "tried_first") stats.triedFirst = (stats.triedFirst || 0) + 1; if (action === "sent_anyway") stats.sentAnyway = (stats.sentAnyway || 0) + 1; await saveDailyStats(auth.uid, auth.idToken, ds, stats); }
  return { ok: true };
}

function emptyStats() { return { total: 0, nudged: 0, allowed: 0, sentAnyway: 0, triedFirst: 0, categories: {}, subjects: {} }; }
function todayStr() { return new Date().toISOString().split("T")[0]; }

async function handleClassification(promptText, images = [], site = "") {
  const settings = await chrome.storage.sync.get(["apiKey", "enabled"]);
  if (settings.enabled === false) return { error: "disabled" };
  if (!settings.apiKey) return { error: "No API key set. Click the Think icon to add your OpenAI key." };
  let profile = null;
  const auth = await getValidToken();
  if (auth) { try { profile = await getUserProfile(auth.uid, auth.idToken); } catch (e) {} }
  if (!profile) { const local = await chrome.storage.sync.get(["classes", "difficulty", "sensitivity"]); profile = { classes: local.classes ? (typeof local.classes === "string" ? local.classes.split(",").map(s => s.trim()) : local.classes) : [], difficulty: local.difficulty || "high_school", sensitivity: local.sensitivity || 2, dynamicKnowledge: {} }; }
  const result = await callOpenAI(settings.apiKey, promptText, images, profile);
  if (result.error) return result;
  const sens = profile.sensitivity || 2;
  if (sens <= 1 && result.outsourcing_risk === "low") result.recommended_intervention = "allow";
  if (sens >= 3 && result.outsourcing_risk !== "low" && result.recommended_intervention === "allow") result.recommended_intervention = "hint";
  syncToFirebase(result, promptText, site, auth, profile);
  return result;
}

async function syncToFirebase(classification, promptText, site, auth, profile) {
  try {
    if (!auth) { const local = await chrome.storage.local.get("sessionStats"); const s = local.sessionStats || emptyStats(); s.total++; const cat = classification.intent_category; s.categories[cat] = (s.categories[cat] || 0) + 1; if (classification.subject) { s.subjects = s.subjects || {}; s.subjects[classification.subject] = (s.subjects[classification.subject] || 0) + 1; } if (classification.recommended_intervention === "allow") s.allowed++; else s.nudged++; await chrome.storage.local.set({ sessionStats: s }); return; }
    await logPrompt(auth.uid, auth.idToken, { text: promptText.slice(0, 500), intentCategory: classification.intent_category, outsourcingRisk: classification.outsourcing_risk, confidence: classification.confidence, subject: classification.subject, intervention: classification.recommended_intervention, site: site || "unknown" });
    const ds = todayStr(); const stats = (await getDailyStats(auth.uid, auth.idToken, ds)) || emptyStats(); stats.total = (stats.total || 0) + 1; const cat = classification.intent_category; if (!stats.categories) stats.categories = {}; stats.categories[cat] = (stats.categories[cat] || 0) + 1; if (!stats.subjects) stats.subjects = {}; if (classification.subject) stats.subjects[classification.subject] = (stats.subjects[classification.subject] || 0) + 1; if (classification.recommended_intervention === "allow") stats.allowed = (stats.allowed || 0) + 1; else stats.nudged = (stats.nudged || 0) + 1; await saveDailyStats(auth.uid, auth.idToken, ds, stats);
    if (classification.subject && classification.outsourcing_risk !== "low" && classification.profile_update) await updateDynamicProfile(auth.uid, auth.idToken, { subject: classification.subject, topic: classification.profile_update.topic || null });
  } catch (e) { console.error("[Think] Sync error:", e); }
}

async function callOpenAI(apiKey, promptText, images, profile) {
  const systemPrompt = buildSystemPrompt(profile);
  const userContent = [];
  if (images && images.length > 0) { for (const imgUrl of images) userContent.push({ type: "image_url", image_url: { url: imgUrl, detail: "low" } }); userContent.push({ type: "text", text: `[Prompt with ${images.length} image(s)]:\n${promptText}` }); }
  else userContent.push({ type: "text", text: promptText });
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }], temperature: 0.2, max_tokens: 400 }) });
    if (!res.ok) { const err = await res.json().catch(() => ({})); return { error: `API error ${res.status}: ${err.error?.message || "Unknown"}` }; }
    const data = await res.json(); return parseClassification(data.choices?.[0]?.message?.content || "");
  } catch (e) { return { error: `Network error: ${e.message}` }; }
}

function buildSystemPrompt(profile) {
  const classes = Array.isArray(profile.classes) ? profile.classes.join(", ") : profile.classes || "General";
  const difficulty = profile.difficulty || "high_school";
  let dynamicCtx = "";
  if (profile.dynamicKnowledge && Object.keys(profile.dynamicKnowledge).length > 0) {
    dynamicCtx = "\nDYNAMIC KNOWLEDGE (learned from usage):\n" + Object.entries(profile.dynamicKnowledge).map(([subj, d]) => `  - ${subj}: ${d.promptCount} prompts${d.topics?.length ? ` (topics: ${d.topics.slice(-5).join(", ")})` : ""}`).join("\n") + "\n";
  }
  return `You are Think, a cognitive dependency classifier. Evaluate whether a student's AI prompt is something they should try solving themselves.

STUDENT PROFILE:
- Level: ${difficulty}
- Classes: ${classes}
${dynamicCtx}
EVALUATE THESE DIMENSIONS:
1. intent_category (string): "direct_answer" | "homework_completion" | "concept_clarification" | "brainstorming" | "editing_polishing" | "advanced_help" | "casual_chat"
2. outsourcing_risk (string): "low" | "medium" | "high"
3. confidence (number 0-1)
4. subject (string): e.g. "calculus", "english", "biology", "computer_science", "general"
5. recommended_intervention (string): "allow" | "hint" | "nudge" | "cooldown"
6. message (string): Brief, friendly, non-preachy (1-2 sentences). Supportive coach, not nagging parent.
7. hint (string|null): If intervention is hint/nudge/cooldown, give a concrete starting point. Otherwise null.
8. profile_update (object|null): If this reveals a specific topic: { "topic": "integration by parts" }. Otherwise null.

Consider the student's classes when judging. A calculus student asking basic algebra = high risk. A biology student asking advanced genetics = low risk. Images: evaluate the intellectual content being requested.

RESPOND ONLY with this JSON:
{"intent_category":"...","outsourcing_risk":"...","confidence":0.85,"subject":"...","recommended_intervention":"...","message":"...","hint":"..." or null,"profile_update":{"topic":"..."} or null}`;
}

function parseClassification(content) {
  try {
    const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const p = JSON.parse(cleaned);
    return { intent_category: p.intent_category || "casual_chat", outsourcing_risk: p.outsourcing_risk || "low", confidence: Math.min(1, Math.max(0, parseFloat(p.confidence) || 0.5)), subject: p.subject || "general", recommended_intervention: p.recommended_intervention || "allow", message: p.message || "Processing...", hint: p.hint || null, profile_update: p.profile_update || null };
  } catch (e) {
    return { intent_category: "unknown", outsourcing_risk: "low", confidence: 0, subject: "general", recommended_intervention: "allow", message: "Could not classify. Sending through.", hint: null, profile_update: null };
  }
}
