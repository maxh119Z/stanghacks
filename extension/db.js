import { FIRESTORE_URL } from "./firebase-config.js";

// ── Firestore Type Converters ────────────────────────────────

function toVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toVal) } };
  if (typeof v === "object") { const fields = {}; for (const [k, val] of Object.entries(v)) fields[k] = toVal(val); return { mapValue: { fields } }; }
  return { stringValue: String(v) };
}

function fromVal(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromVal);
  if ("mapValue" in v) return fromDoc(v.mapValue);
  if ("timestampValue" in v) return v.timestampValue;
  return null;
}

function fromDoc(doc) { const out = {}; for (const [k, v] of Object.entries(doc.fields || {})) out[k] = fromVal(v); return out; }
function toFields(obj) { const fields = {}; for (const [k, v] of Object.entries(obj)) fields[k] = toVal(v); return fields; }

// ── CRUD ─────────────────────────────────────────────────────

export async function getDoc(path, idToken) {
  const res = await fetch(`${FIRESTORE_URL}/${path}`, { headers: { Authorization: `Bearer ${idToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return fromDoc(await res.json());
}

export async function setDoc(path, data, idToken) {
  const res = await fetch(`${FIRESTORE_URL}/${path}`, { method: "PATCH", headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: toFields(data) }) });
  if (!res.ok) throw new Error(`SET ${path}: ${res.status} ${await res.text()}`);
  return fromDoc(await res.json());
}

export async function addDoc(collectionPath, data, idToken) {
  const res = await fetch(`${FIRESTORE_URL}/${collectionPath}`, { method: "POST", headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: toFields(data) }) });
  if (!res.ok) throw new Error(`ADD ${collectionPath}: ${res.status}`);
  const raw = await res.json();
  return { id: raw.name.split("/").pop(), ...fromDoc(raw) };
}

export async function deleteDoc(path, idToken) {
  const res = await fetch(`${FIRESTORE_URL}/${path}`, { method: "DELETE", headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok && res.status !== 404) throw new Error(`DELETE ${path}: ${res.status}`);
}

export async function listDocs(collectionPath, idToken, pageSize = 100) {
  const res = await fetch(`${FIRESTORE_URL}/${collectionPath}?pageSize=${pageSize}`, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) throw new Error(`LIST ${collectionPath}: ${res.status}`);
  const data = await res.json();
  return (data.documents || []).map((doc) => ({ id: doc.name.split("/").pop(), ...fromDoc(doc) }));
}

// ── User Operations ──────────────────────────────────────────

export async function getUserProfile(uid, idToken) { return await getDoc(`users/${uid}`, idToken); }
export async function saveUserProfile(uid, idToken, profile) { return await setDoc(`users/${uid}`, profile, idToken); }

export async function logPrompt(uid, idToken, promptData) {
  return await addDoc(`users/${uid}/prompts`, { ...promptData, timestamp: new Date().toISOString() }, idToken);
}

export async function getDailyStats(uid, idToken, dateStr) { return await getDoc(`users/${uid}/dailyStats/${dateStr}`, idToken); }
export async function saveDailyStats(uid, idToken, dateStr, stats) { return await setDoc(`users/${uid}/dailyStats/${dateStr}`, stats, idToken); }

export async function listPrompts(uid, idToken, limit = 50) {
  const prompts = await listDocs(`users/${uid}/prompts`, idToken, limit);
  return prompts.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
}

export async function resetDailyStats(uid, idToken, days = 30) {
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    try { await deleteDoc(`users/${uid}/dailyStats/${d.toISOString().split("T")[0]}`, idToken); } catch (e) {}
  }
}

export async function updateDynamicProfile(uid, idToken, updates) {
  const existing = (await getUserProfile(uid, idToken)) || {};
  const dk = existing.dynamicKnowledge || {};
  if (updates.subject) {
    const subj = updates.subject;
    if (!dk[subj]) dk[subj] = { promptCount: 0, topics: [] };
    dk[subj].promptCount = (dk[subj].promptCount || 0) + 1;
    if (updates.topic && !(dk[subj].topics || []).includes(updates.topic)) {
      dk[subj].topics = [...(dk[subj].topics || []), updates.topic].slice(-20);
    }
  }
  await setDoc(`users/${uid}`, { ...existing, dynamicKnowledge: dk, lastActive: new Date().toISOString() }, idToken);
}

// ── Class Operations ─────────────────────────────────────────

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createClass(idToken, data) {
  // data: { name, teacherUid, teacherName }
  const classData = {
    name: data.name,
    teacherUid: data.teacherUid,
    teacherName: data.teacherName,
    code: generateCode(),
    createdAt: new Date().toISOString(),
    studentCount: 0,
    studentUids: [],
  };
  const result = await addDoc("classes", classData, idToken);
  return { id: result.id, ...classData };
}

export async function getClassById(classId, idToken) {
  return await getDoc(`classes/${classId}`, idToken);
}

// Find a class by its join code - scan all classes (small scale, fine for hackathon)
export async function getClassByCode(code, idToken) {
  const classes = await listDocs("classes", idToken, 500);
  return classes.find((c) => c.code === code.toUpperCase()) || null;
}

export async function joinClass(classId, studentUid, idToken) {
  const cls = await getClassById(classId, idToken);
  if (!cls) throw new Error("Class not found");
  const uids = cls.studentUids || [];
  if (uids.includes(studentUid)) return cls; // already joined
  uids.push(studentUid);
  cls.studentUids = uids;
  cls.studentCount = uids.length;
  await setDoc(`classes/${classId}`, cls, idToken);
  return cls;
}

export async function leaveClass(classId, studentUid, idToken) {
  const cls = await getClassById(classId, idToken);
  if (!cls) return;
  cls.studentUids = (cls.studentUids || []).filter((u) => u !== studentUid);
  cls.studentCount = cls.studentUids.length;
  await setDoc(`classes/${classId}`, cls, idToken);
}

// Get all classes for a teacher
export async function getTeacherClasses(teacherUid, idToken) {
  const all = await listDocs("classes", idToken, 500);
  return all.filter((c) => c.teacherUid === teacherUid);
}

// Get all classes a student is in
export async function getStudentClasses(studentUid, idToken) {
  const all = await listDocs("classes", idToken, 500);
  return all.filter((c) => (c.studentUids || []).includes(studentUid));
}

// Get a student's flagged prompts (outsourcingRisk != "low")
export async function getStudentFlaggedPrompts(studentUid, idToken, limit = 50) {
  const prompts = await listPrompts(studentUid, idToken, limit);
  return prompts.filter((p) => p.outsourcingRisk && p.outsourcingRisk !== "low");
}

// Get aggregated stats for a student over N days
export async function getStudentStatsAggregate(studentUid, idToken, days = 7) {
  const agg = { total: 0, nudged: 0, allowed: 0, categories: {}, subjects: {}, sites: {} };
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    const s = await getDailyStats(studentUid, idToken, ds);
    if (!s) continue;
    agg.total += s.total || 0;
    agg.nudged += s.nudged || 0;
    agg.allowed += s.allowed || 0;
    for (const [k, v] of Object.entries(s.categories || {})) agg.categories[k] = (agg.categories[k] || 0) + v;
    for (const [k, v] of Object.entries(s.subjects || {})) agg.subjects[k] = (agg.subjects[k] || 0) + v;
    for (const [k, v] of Object.entries(s.sites || {})) agg.sites[k] = (agg.sites[k] || 0) + v;
  }
  return agg;
}
