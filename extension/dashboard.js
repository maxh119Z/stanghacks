function msg(type, data = {}) { return new Promise((r) => chrome.runtime.sendMessage({ type, ...data }, r)); }
function toast(m) { const el = document.getElementById("toast"); el.textContent = m; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2000); }

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active"); document.getElementById(tab.dataset.panel).classList.add("active");
    if (tab.dataset.panel === "history" && !historyLoaded) loadHistory();
    if (tab.dataset.panel === "classes" && !classesLoaded) loadClasses();
  });
});

async function initAuth() {
  const auth = await msg("GET_AUTH");
  if (!auth || !auth.loggedIn) {
    document.querySelector(".container").innerHTML = '<div style="text-align:center;padding:60px;color:#6a6a6a;">Sign in via the Think popup to use the dashboard.</div>';
    return false;
  }
  document.getElementById("navEmail").textContent = auth.displayName || auth.email;
  if (auth.photoUrl) { const av = document.getElementById("navAvatar"); av.src = auth.photoUrl; av.style.display = "block"; }
  return true;
}
document.getElementById("navSignout").addEventListener("click", async () => { await msg("SIGN_OUT"); location.reload(); });

// ── Overview ──
async function loadOverview() {
  const res = await msg("GET_STATS", { days: 7 }); if (!res?.stats || res.error) return;
  const stats = res.stats;
  const t = stats.reduce((s, d) => s + (d.total || 0), 0);
  const n = stats.reduce((s, d) => s + (d.nudged || 0), 0);
  const c = stats.reduce((s, d) => s + (d.allowed || 0), 0);
  document.getElementById("oTotal").textContent = t;
  document.getElementById("oNudged").textContent = n;
  document.getElementById("oClean").textContent = c;
  document.getElementById("oRate").textContent = t > 0 ? Math.round((n / t) * 100) + "%" : "0%";
  const chart = document.getElementById("weekChart"); chart.innerHTML = "";
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const ordered = [...stats].reverse();
  const maxV = Math.max(...ordered.map(d => d.total || 0), 1);
  ordered.forEach(day => {
    const g = document.createElement("div"); g.className = "bar-group";
    const cb = document.createElement("div"); cb.className = "bar clean"; cb.style.height = Math.max(2, ((day.allowed||0)/maxV)*120) + "px";
    const nb = document.createElement("div"); nb.className = "bar nudged"; nb.style.height = Math.max(2, ((day.nudged||0)/maxV)*120) + "px";
    const lb = document.createElement("div"); lb.className = "bar-label"; const dd = new Date(day.date); lb.textContent = isNaN(dd) ? "?" : days[dd.getDay()];
    g.appendChild(cb); g.appendChild(nb); g.appendChild(lb); chart.appendChild(g);
  });
  const allC = {}, allS = {}, allSi = {};
  stats.forEach(d => { for (const [k,v] of Object.entries(d.categories||{})) allC[k]=(allC[k]||0)+v; for (const [k,v] of Object.entries(d.subjects||{})) allS[k]=(allS[k]||0)+v; for (const [k,v] of Object.entries(d.sites||{})) allSi[k]=(allSi[k]||0)+v; });
  renderBD("catBreakdown", allC); renderBD("subjBreakdown", allS); renderBD("siteBreakdown", allSi);
}
function renderBD(id, data) {
  const el = document.getElementById(id); const entries = Object.entries(data).sort((a,b)=>b[1]-a[1]); if (!entries.length) return;
  const max = Math.max(...entries.map(([,v])=>v),1);
  el.innerHTML = entries.map(([n,c])=>`<div class="cat-row"><div class="cat-name">${n.replace(/_/g," ")}</div><div class="cat-bar-bg"><div class="cat-bar-fill" style="width:${(c/max)*100}%"></div></div><div class="cat-count">${c}</div></div>`).join("");
}

// ── History ──
let historyLoaded = false, allPrompts = [];
async function loadHistory() {
  historyLoaded = true;
  const res = await msg("GET_PROMPTS", { limit: 100 }); if (res?.error) { document.getElementById("historyContent").innerHTML = `<div class="empty">${res.error}</div>`; return; }
  allPrompts = res?.prompts || []; renderHistory(allPrompts);
}
function renderHistory(prompts) {
  const el = document.getElementById("historyContent");
  if (!prompts.length) { el.innerHTML = '<div class="empty">No prompts yet</div>'; return; }
  el.innerHTML = `<table class="prompt-table"><thead><tr><th>Time</th><th>Prompt</th><th>Category</th><th>Subject</th><th>Risk</th><th>Site</th></tr></thead><tbody>${prompts.map(p => {
    const time = p.timestamp ? new Date(p.timestamp).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "?";
    const rc = p.outsourcingRisk==="high"?"risk-high":p.outsourcingRisk==="medium"?"risk-medium":"risk-low";
    return `<tr><td style="white-space:nowrap;font-size:11px;color:#6a6a6a;">${time}</td><td class="prompt-text" title="${(p.text||"").replace(/"/g,'&quot;')}">${p.text||""}</td><td><span class="tag">${(p.intentCategory||"").replace(/_/g," ")}</span></td><td style="text-transform:capitalize;">${p.subject||""}</td><td><span class="tag ${rc}">${(p.outsourcingRisk||"").toUpperCase()}</span></td><td style="font-size:11px;color:#6a6a6a;">${(p.site||"").replace("www.","").split(".")[0]}</td></tr>`;
  }).join("")}</tbody></table>`;
}
document.getElementById("exportCsv").addEventListener("click", () => {
  if (!allPrompts.length) { toast("No data"); return; }
  const h = ["timestamp","text","intentCategory","outsourcingRisk","confidence","subject","intervention","site"];
  const rows = allPrompts.map(p=>h.map(k=>{let v=String(p[k]||"");if(v.includes(",")||v.includes('"'))v='"'+v.replace(/"/g,'""')+'"';return v;}).join(","));
  const blob = new Blob([[h.join(","),...rows].join("\n")],{type:"text/csv"});
  const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`think-export-${new Date().toISOString().split("T")[0]}.csv`; a.click();
  toast("Exported");
});

// ── Classes (join/leave) ──
let classesLoaded = false;
async function loadClasses() {
  classesLoaded = true;
  const res = await msg("GET_MY_CLASSES"); if (res?.error) return;
  const el = document.getElementById("myClasses");
  const classes = res.classes || [];
  if (!classes.length) { el.innerHTML = '<div class="empty">No classes joined yet</div>'; return; }
  el.innerHTML = classes.map(c => `<div class="class-card"><div><div class="cname">${c.name}</div><div class="cteacher">${c.teacherName || "Teacher"} &middot; Code: ${c.code}</div></div><button data-id="${c.id}">Leave</button></div>`).join("");
  el.querySelectorAll("button").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Leave this class?")) return;
    await msg("LEAVE_CLASS", { classId: b.dataset.id }); loadClasses();
  }));
}
document.getElementById("joinBtn").addEventListener("click", async () => {
  const code = document.getElementById("joinCode").value.trim();
  if (!code || code.length < 3) { toast("Enter a valid code"); return; }
  const btn = document.getElementById("joinBtn"); btn.textContent = "Joining..."; btn.disabled = true;
  const res = await msg("JOIN_CLASS", { code });
  btn.textContent = "Join"; btn.disabled = false;
  if (res?.error) { toast(res.error); return; }
  toast("Joined " + res.className); document.getElementById("joinCode").value = ""; loadClasses();
});

// ── Profile ──
async function loadProfile() {
  const res = await msg("GET_PROFILE"); if (res?.error) return; const p = res?.profile || {};
  document.getElementById("profName").value = p.displayName || "";
  document.getElementById("profStatus").value = p.currentStatus || "";
  document.getElementById("profClasses").value = Array.isArray(p.classes) ? p.classes.join(", ") : "";
  document.getElementById("profDifficulty").value = p.difficulty || "high_school";
  document.getElementById("profSensitivity").value = p.sensitivity || 2;
  renderKnowledge(p.dynamicKnowledge || {});
}
document.getElementById("saveProfile").addEventListener("click", async () => {
  const existing = (await msg("GET_PROFILE"))?.profile || {};
  const profile = { ...existing, displayName: document.getElementById("profName").value.trim(), currentStatus: document.getElementById("profStatus").value.trim(), classes: document.getElementById("profClasses").value.trim().split(",").map(c=>c.trim()).filter(Boolean), difficulty: document.getElementById("profDifficulty").value, sensitivity: parseInt(document.getElementById("profSensitivity").value) };
  chrome.storage.sync.set({ currentStatus: profile.currentStatus });
  const res = await msg("SAVE_PROFILE", { profile }); toast(res?.error ? "Error" : "Saved");
});

// ── Knowledge (edit) ──
let currentDK = {};
function renderKnowledge(dk) {
  currentDK = dk; const grid = document.getElementById("knowledgeGrid"); const entries = Object.entries(dk);
  if (!entries.length) { grid.innerHTML = '<div class="empty">Populates as you use AI tools</div>'; return; }
  grid.innerHTML = entries.sort((a,b)=>(b[1].promptCount||0)-(a[1].promptCount||0)).map(([subj,d])=>`<div class="knowledge-chip"><button class="remove-btn" data-subject="${subj}">&times;</button><h4>${subj}</h4><div class="kc">${d.promptCount||0} prompts</div>${d.topics?.length?`<div class="kt">${d.topics.slice(-6).join(" / ")}</div>`:""}</div>`).join("");
  grid.querySelectorAll(".remove-btn").forEach(b=>b.addEventListener("click",async()=>{if(!confirm(`Remove "${b.dataset.subject}"?`))return;delete currentDK[b.dataset.subject];await saveKnowledge();renderKnowledge(currentDK);toast("Removed");}));
}
document.getElementById("addKnowledgeBtn").addEventListener("click", async () => {
  const subj = document.getElementById("addSubject").value.trim().toLowerCase(); if (!subj) return;
  const topic = document.getElementById("addTopic").value.trim();
  if (!currentDK[subj]) currentDK[subj] = { promptCount: 0, topics: [] };
  if (topic && !currentDK[subj].topics.includes(topic)) currentDK[subj].topics.push(topic);
  await saveKnowledge(); renderKnowledge(currentDK);
  document.getElementById("addSubject").value = ""; document.getElementById("addTopic").value = ""; toast("Added");
});
async function saveKnowledge() { const existing = (await msg("GET_PROFILE"))?.profile || {}; existing.dynamicKnowledge = currentDK; await msg("SAVE_PROFILE", { profile: existing }); }

(async () => { const ok = await initAuth(); if (ok) await Promise.all([loadOverview(), loadProfile()]); })();
