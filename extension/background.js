import { googleSignIn, getValidToken, saveAuthToStorage, signOut } from "./auth.js";
import {
  getUserProfile, saveUserProfile, logPrompt, getDailyStats, saveDailyStats,
  updateDynamicProfile, resetDailyStats, listPrompts,
  createClass, getClassByCode, joinClass, getTeacherClasses, getStudentClasses,
  getClassById, getStudentFlaggedPrompts, getStudentStatsAggregate, leaveClass,
} from "./db.js";

// ── Message Router ────────────────────────────────────────────

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
    RESET_STATS: () => handleResetStats(),
    GET_PROMPTS: () => handleGetPrompts(message.limit),
    SAVE_STATUS: () => handleSaveStatus(message.status),
    LOG_ACTION: () => handleLogAction(message.action),
    OPEN_PAGE: () => { chrome.tabs.create({ url: chrome.runtime.getURL(message.page) }); return Promise.resolve({ ok: true }); },
    OPEN_WEBSITE: () => { import("./firebase-config.js").then(({ WEBSITE_URL }) => { chrome.tabs.create({ url: WEBSITE_URL }); }); return Promise.resolve({ ok: true }); },
    // Class operations
    CREATE_CLASS: () => handleCreateClass(message.name),
    JOIN_CLASS: () => handleJoinClass(message.code),
    LEAVE_CLASS: () => handleLeaveClass(message.classId),
    GET_MY_CLASSES: () => handleGetMyClasses(),
    GET_CLASS_DETAIL: () => handleGetClassDetail(message.classId),
    GET_STUDENT_DATA: () => handleGetStudentData(message.studentUid, message.days),
    GET_STUDENT_FLAGGED: () => handleGetStudentFlagged(message.studentUid),
  };
  const handler = handlers[message.type];
  if (handler) { handler().then(sendResponse).catch((e) => sendResponse({ error: e.message })); return true; }
});

// ── Auth ──────────────────────────────────────────────────────

async function handleGoogleSignIn() {
  const authData = await googleSignIn();
  await saveAuthToStorage(authData);
  const profile = await getUserProfile(authData.localId, authData.idToken);
  if (!profile || !profile.role) return { ok: true, uid: authData.localId, needsOnboarding: true };
  return { ok: true, uid: authData.localId, needsOnboarding: false, role: profile.role };
}

async function handleSignOut() {
  await signOut();
  try { chrome.action.setBadgeText({ text: "" }); } catch (e) {}
  return { ok: true };
}

async function getAuthState() {
  const stored = await chrome.storage.local.get(["uid", "email", "displayName", "photoUrl"]);
  if (!stored.uid) return { loggedIn: false };
  // Also get role from profile cache
  const role = (await chrome.storage.local.get(["role"])).role || "student";
  return { loggedIn: true, uid: stored.uid, email: stored.email || null, displayName: stored.displayName || null, photoUrl: stored.photoUrl || null, role };
}

// ── Onboarding ────────────────────────────────────────────────

async function handleSaveOnboarding(profile) {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  const stored = await chrome.storage.local.get(["email", "displayName", "photoUrl"]);
  const role = profile.role || "student";
  const fullProfile = {
    email: stored.email || "", displayName: profile.displayName || stored.displayName || "",
    photoUrl: stored.photoUrl || "", role,
    classes: profile.classes || [], difficulty: profile.difficulty || "high_school",
    sensitivity: profile.sensitivity || 2, currentStatus: "",
    dynamicKnowledge: {},
    createdAt: new Date().toISOString(), lastActive: new Date().toISOString(),
  };
  await saveUserProfile(auth.uid, auth.idToken, fullProfile);
  await chrome.storage.sync.set({ sensitivity: fullProfile.sensitivity });
  await chrome.storage.local.set({ role });
  return { ok: true, role };
}

// ── Profile ───────────────────────────────────────────────────

async function handleGetProfile() {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  const profile = await getUserProfile(auth.uid, auth.idToken);
  if (profile?.role) await chrome.storage.local.set({ role: profile.role });
  return { profile: profile || {} };
}

async function handleSaveProfile(profile) {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  await saveUserProfile(auth.uid, auth.idToken, { ...profile, lastActive: new Date().toISOString() });
  if (profile.sensitivity) await chrome.storage.sync.set({ sensitivity: profile.sensitivity });
  return { ok: true };
}

async function handleSaveStatus(status) {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  const profile = (await getUserProfile(auth.uid, auth.idToken)) || {};
  profile.currentStatus = status || "";
  await saveUserProfile(auth.uid, auth.idToken, { ...profile, lastActive: new Date().toISOString() });
  await chrome.storage.sync.set({ currentStatus: status || "" });
  return { ok: true };
}

// ── Stats ─────────────────────────────────────────────────────

async function handleGetStats(days = 7) {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  const results = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    const s = await getDailyStats(auth.uid, auth.idToken, ds);
    results.push({ date: ds, ...(s || emptyStats()) });
  }
  return { stats: results };
}

async function handleResetStats() {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  await resetDailyStats(auth.uid, auth.idToken, 30);
  try { chrome.action.setBadgeText({ text: "" }); } catch (e) {}
  return { ok: true };
}

async function handleLogAction(action) {
  const auth = await getValidToken(); if (!auth) return { ok: true };
  const ds = todayStr();
  const stats = (await getDailyStats(auth.uid, auth.idToken, ds)) || emptyStats();
  if (action === "tried_first") stats.triedFirst = (stats.triedFirst || 0) + 1;
  if (action === "sent_anyway") stats.sentAnyway = (stats.sentAnyway || 0) + 1;
  await saveDailyStats(auth.uid, auth.idToken, ds, stats);
  return { ok: true };
}

async function handleGetPrompts(limit = 50) {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  return { prompts: await listPrompts(auth.uid, auth.idToken, limit) };
}

// ── Class Operations ──────────────────────────────────────────

async function handleCreateClass(name) {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  const profile = await getUserProfile(auth.uid, auth.idToken);
  if (!profile || profile.role !== "teacher") return { error: "Only teachers can create classes" };
  const cls = await createClass(auth.idToken, {
    name, teacherUid: auth.uid, teacherName: profile.displayName || profile.email || "Teacher",
  });
  return { ok: true, classData: cls };
}

async function handleJoinClass(code) {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  const cls = await getClassByCode(code, auth.idToken);
  if (!cls) return { error: "No class found with that code" };
  await joinClass(cls.id, auth.uid, auth.idToken);
  return { ok: true, className: cls.name, classId: cls.id };
}

async function handleLeaveClass(classId) {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  await leaveClass(classId, auth.uid, auth.idToken);
  return { ok: true };
}

async function handleGetMyClasses() {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  const profile = await getUserProfile(auth.uid, auth.idToken);
  if (profile?.role === "teacher") {
    return { classes: await getTeacherClasses(auth.uid, auth.idToken), role: "teacher" };
  } else {
    return { classes: await getStudentClasses(auth.uid, auth.idToken), role: "student" };
  }
}

async function handleGetClassDetail(classId) {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  const cls = await getClassById(classId, auth.idToken);
  if (!cls) return { error: "Class not found" };
  // Get basic info for each student
  const students = [];
  for (const suid of (cls.studentUids || [])) {
    try {
      const p = await getUserProfile(suid, auth.idToken);
      const stats = await getStudentStatsAggregate(suid, auth.idToken, 7);
      students.push({ uid: suid, name: p?.displayName || p?.email || "Student", email: p?.email || "", stats });
    } catch (e) { students.push({ uid: suid, name: "Unknown", email: "", stats: emptyStats() }); }
  }
  return { classData: cls, students };
}

async function handleGetStudentData(studentUid, days = 7) {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  const stats = await getStudentStatsAggregate(studentUid, auth.idToken, days);
  const profile = await getUserProfile(studentUid, auth.idToken);
  return { stats, name: profile?.displayName || profile?.email || "Student" };
}

async function handleGetStudentFlagged(studentUid) {
  const auth = await getValidToken(); if (!auth) return { error: "Not logged in" };
  const flagged = await getStudentFlaggedPrompts(studentUid, auth.idToken, 100);
  return { prompts: flagged };
}

// ── Badge ─────────────────────────────────────────────────────

async function updateBadge() {
  try {
    const auth = await getValidToken(); if (!auth) return;
    const ds = todayStr();
    const stats = await getDailyStats(auth.uid, auth.idToken, ds);
    const nudged = stats?.nudged || 0;
    chrome.action.setBadgeText({ text: nudged > 0 ? String(nudged) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#f14c4c" });
  } catch (e) {}
}

function emptyStats() { return { total: 0, nudged: 0, allowed: 0, sentAnyway: 0, triedFirst: 0, categories: {}, subjects: {}, sites: {} }; }
function todayStr() { return new Date().toISOString().split("T")[0]; }

// ── Classification (students only but works for all) ──────────

async function handleClassification(promptText, images = [], site = "") {
  const settings = await chrome.storage.sync.get(["apiKey", "enabled"]);
  if (settings.enabled === false) return { error: "disabled" };
  if (!settings.apiKey) return { error: "No API key. Open Think popup and add your OpenAI key." };
  const auth = await getValidToken();
  if (!auth) return { error: "Not signed in. Open Think popup and sign in with Google." };

  let profile = null;
  try { profile = await getUserProfile(auth.uid, auth.idToken); } catch (e) {}
  if (!profile) profile = { classes: [], difficulty: "high_school", sensitivity: 2, currentStatus: "", dynamicKnowledge: {} };
  const cached = await chrome.storage.sync.get(["currentStatus"]);
  if (cached.currentStatus && !profile.currentStatus) profile.currentStatus = cached.currentStatus;

  const result = await callOpenAI(settings.apiKey, promptText, images, profile);
  if (result.error) return result;

  const sens = profile.sensitivity || 2;
  if (sens <= 1 && result.outsourcing_risk === "low") result.recommended_intervention = "allow";
  if (sens >= 3 && result.outsourcing_risk !== "low" && result.recommended_intervention === "allow") result.recommended_intervention = "hint";

  syncToFirebase(result, promptText, site, auth);
  updateBadge();
  return result;
}

async function syncToFirebase(classification, promptText, site, auth) {
  try {
    await logPrompt(auth.uid, auth.idToken, {
      text: promptText.slice(0, 500), intentCategory: classification.intent_category,
      outsourcingRisk: classification.outsourcing_risk, confidence: classification.confidence,
      subject: classification.subject, intervention: classification.recommended_intervention, site: site || "unknown",
    });
    const ds = todayStr();
    const stats = (await getDailyStats(auth.uid, auth.idToken, ds)) || emptyStats();
    stats.total = (stats.total || 0) + 1;
    const cat = classification.intent_category;
    if (!stats.categories) stats.categories = {};
    stats.categories[cat] = (stats.categories[cat] || 0) + 1;
    if (!stats.subjects) stats.subjects = {};
    if (classification.subject) stats.subjects[classification.subject] = (stats.subjects[classification.subject] || 0) + 1;
    if (!stats.sites) stats.sites = {};
    const siteName = site ? site.replace("www.", "").split(".")[0] : "unknown";
    stats.sites[siteName] = (stats.sites[siteName] || 0) + 1;
    if (classification.recommended_intervention === "allow") stats.allowed = (stats.allowed || 0) + 1;
    else stats.nudged = (stats.nudged || 0) + 1;
    await saveDailyStats(auth.uid, auth.idToken, ds, stats);
    if (classification.subject && classification.outsourcing_risk !== "low" && classification.profile_update) {
      await updateDynamicProfile(auth.uid, auth.idToken, { subject: classification.subject, topic: classification.profile_update.topic || null });
    }
  } catch (e) { console.error("[Think] Sync error:", e); }
}

async function callOpenAI(apiKey, promptText, images, profile) {
  const systemPrompt = buildSystemPrompt(profile);
  const userContent = [];
  if (images && images.length > 0) {
    for (const imgUrl of images) userContent.push({ type: "image_url", image_url: { url: imgUrl, detail: "low" } });
    userContent.push({ type: "text", text: `[Prompt with ${images.length} image(s)]:\n${promptText}` });
  } else { userContent.push({ type: "text", text: promptText }); }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }], temperature: 0.2, max_tokens: 400 }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); return { error: `API error ${res.status}: ${err.error?.message || "Unknown"}` }; }
    const data = await res.json(); return parseClassification(data.choices?.[0]?.message?.content || "");
  } catch (e) { return { error: `Network error: ${e.message}` }; }
}

function buildSystemPrompt(profile) {
  const classes = Array.isArray(profile.classes) ? profile.classes.join(", ") : profile.classes || "General";
  const difficulty = profile.difficulty || "high_school";
  let dynamicCtx = "";
  if (profile.dynamicKnowledge && Object.keys(profile.dynamicKnowledge).length > 0) {
    dynamicCtx = "\nDYNAMIC KNOWLEDGE:\n" + Object.entries(profile.dynamicKnowledge).map(([subj, d]) => `  - ${subj}: ${d.promptCount} prompts${d.topics?.length ? ` (${d.topics.slice(-5).join(", ")})` : ""}`).join("\n") + "\n";
  }
  let statusCtx = "";
  if (profile.currentStatus) {
    statusCtx = `\nCURRENT STATUS: "${profile.currentStatus}"\nBe slightly more lenient with concept clarification and brainstorming for this topic. Do NOT reduce outsourcing risk for direct answers or homework completion.\n`;
  }
  return `You are Think, a cognitive dependency classifier. Evaluate whether a student's AI prompt is something they should try solving themselves.

STUDENT PROFILE:
- Level: ${difficulty}
- Classes: ${classes}
${dynamicCtx}${statusCtx}
EVALUATE:
1. intent_category: "direct_answer"|"homework_completion"|"concept_clarification"|"brainstorming"|"editing_polishing"|"advanced_help"|"casual_chat"
2. outsourcing_risk: "low"|"medium"|"high"
3. confidence: 0-1
4. subject: e.g. "calculus","english","biology","computer_science","general"
5. recommended_intervention: "allow"|"hint"|"nudge"|"cooldown"
6. message: Brief, friendly, non-preachy (1-2 sentences).
7. hint: If intervention != allow, give a starting point. Otherwise null.
8. profile_update: If specific topic revealed: {"topic":"..."}. Otherwise null.

Consider classes when judging. Calculus student asking basic algebra = high risk.

RESPOND ONLY JSON:
{"intent_category":"...","outsourcing_risk":"...","confidence":0.85,"subject":"...","recommended_intervention":"...","message":"...","hint":null,"profile_update":null}`;
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

updateBadge();
