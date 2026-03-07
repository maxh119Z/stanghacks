import { FIRESTORE_URL } from "./firebase-config.js";

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
  return await res.json();
}

export async function getUserProfile(uid, idToken) { return await getDoc(`users/${uid}`, idToken); }
export async function saveUserProfile(uid, idToken, profile) { return await setDoc(`users/${uid}`, profile, idToken); }
export async function logPrompt(uid, idToken, promptData) { return await addDoc(`users/${uid}/prompts`, { ...promptData, timestamp: new Date().toISOString() }, idToken); }
export async function getDailyStats(uid, idToken, dateStr) { return await getDoc(`users/${uid}/dailyStats/${dateStr}`, idToken); }
export async function saveDailyStats(uid, idToken, dateStr, stats) { return await setDoc(`users/${uid}/dailyStats/${dateStr}`, stats, idToken); }

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
