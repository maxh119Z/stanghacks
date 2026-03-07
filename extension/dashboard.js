function msg(type, data = {}) { return new Promise((r) => chrome.runtime.sendMessage({ type, ...data }, r)); }
function toast(m) { const el = document.getElementById("toast"); el.textContent = m; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2000); }

// ── Tabs ──
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.panel).classList.add("active");
    // Lazy-load history on first click
    if (tab.dataset.panel === "history" && !historyLoaded) loadHistory();
  });
});

// ── Auth ──
async function initAuth() {
  const auth = await msg("GET_AUTH");
  if (!auth || !auth.loggedIn) {
    document.getElementById("navEmail").textContent = "Not signed in";
    document.getElementById("navSignout").style.display = "none";
    document.querySelector(".container").innerHTML = '<div style="text-align:center;padding:60px 20px;color:#6a6a6a;">Sign in via the Think extension popup to use the dashboard.</div>';
    return false;
  }
  document.getElementById("navEmail").textContent = auth.displayName || auth.email;
  if (auth.photoUrl) { const av = document.getElementById("navAvatar"); av.src = auth.photoUrl; av.style.display = "block"; }
  return true;
}

document.getElementById("navSignout").addEventListener("click", async () => { await msg("SIGN_OUT"); location.reload(); });

// ── Overview ──
async function loadOverview() {
  const res = await msg("GET_STATS", { days: 7 });
  if (!res?.stats || res.error) return;
  const stats = res.stats;

  const totalAll = stats.reduce((s, d) => s + (d.total || 0), 0);
  const nudgedAll = stats.reduce((s, d) => s + (d.nudged || 0), 0);
  const cleanAll = stats.reduce((s, d) => s + (d.allowed || 0), 0);
  document.getElementById("oTotal").textContent = totalAll;
  document.getElementById("oNudged").textContent = nudgedAll;
  document.getElementById("oClean").textContent = cleanAll;
  document.getElementById("oRate").textContent = totalAll > 0 ? Math.round((nudgedAll / totalAll) * 100) + "%" : "0%";

  // Bar chart
  const chart = document.getElementById("weekChart"); chart.innerHTML = "";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const ordered = [...stats].reverse();
  const maxVal = Math.max(...ordered.map((d) => d.total || 0), 1);
  ordered.forEach((day) => {
    const g = document.createElement("div"); g.className = "bar-group";
    const cBar = document.createElement("div"); cBar.className = "bar clean";
    cBar.style.height = Math.max(2, ((day.allowed || 0) / maxVal) * 120) + "px"; cBar.title = "Clean: " + (day.allowed || 0);
    const nBar = document.createElement("div"); nBar.className = "bar nudged";
    nBar.style.height = Math.max(2, ((day.nudged || 0) / maxVal) * 120) + "px"; nBar.title = "Nudged: " + (day.nudged || 0);
    const lbl = document.createElement("div"); lbl.className = "bar-label";
    const d = new Date(day.date); lbl.textContent = isNaN(d) ? "?" : days[d.getDay()];
    g.appendChild(cBar); g.appendChild(nBar); g.appendChild(lbl); chart.appendChild(g);
  });

  // Aggregate breakdowns
  const allCats = {}, allSubjects = {}, allSites = {};
  stats.forEach((d) => {
    for (const [k, v] of Object.entries(d.categories || {})) allCats[k] = (allCats[k] || 0) + v;
    for (const [k, v] of Object.entries(d.subjects || {})) allSubjects[k] = (allSubjects[k] || 0) + v;
    for (const [k, v] of Object.entries(d.sites || {})) allSites[k] = (allSites[k] || 0) + v;
  });
  renderBreakdown("catBreakdown", allCats);
  renderBreakdown("subjBreakdown", allSubjects);
  renderBreakdown("siteBreakdown", allSites);
}

function renderBreakdown(id, data) {
  const el = document.getElementById(id);
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  el.innerHTML = entries.map(([name, count]) =>
    `<div class="cat-row"><div class="cat-name">${name.replace(/_/g, " ")}</div><div class="cat-bar-bg"><div class="cat-bar-fill" style="width:${(count / max) * 100}%"></div></div><div class="cat-count">${count}</div></div>`
  ).join("");
}

// ── Prompt History ──
let historyLoaded = false;
let allPrompts = [];

async function loadHistory() {
  historyLoaded = true;
  const res = await msg("GET_PROMPTS", { limit: 100 });
  if (res?.error) { document.getElementById("historyContent").innerHTML = `<div class="empty">${res.error}</div>`; return; }
  allPrompts = res?.prompts || [];
  renderHistory(allPrompts);
}

function renderHistory(prompts) {
  const el = document.getElementById("historyContent");
  if (!prompts.length) { el.innerHTML = '<div class="empty">No prompts logged yet</div>'; return; }

  el.innerHTML = `<table class="prompt-table">
    <thead><tr><th>Time</th><th>Prompt</th><th>Category</th><th>Subject</th><th>Risk</th><th>Action</th><th>Site</th></tr></thead>
    <tbody>${prompts.map((p) => {
      const time = p.timestamp ? new Date(p.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "?";
      const riskClass = p.outsourcingRisk === "high" ? "risk-high" : p.outsourcingRisk === "medium" ? "risk-medium" : "risk-low";
      return `<tr>
        <td style="white-space:nowrap;font-size:11px;color:#6a6a6a;">${time}</td>
        <td class="prompt-text" title="${(p.text || "").replace(/"/g, '&quot;')}">${p.text || ""}</td>
        <td><span class="tag">${(p.intentCategory || "").replace(/_/g, " ")}</span></td>
        <td style="text-transform:capitalize;">${p.subject || ""}</td>
        <td><span class="tag ${riskClass}">${(p.outsourcingRisk || "").toUpperCase()}</span></td>
        <td style="font-size:11px;">${p.intervention || ""}</td>
        <td style="font-size:11px;color:#6a6a6a;">${(p.site || "").replace("www.", "").split(".")[0]}</td>
      </tr>`;
    }).join("")}</tbody></table>`;
}

// ── CSV Export ──
document.getElementById("exportCsv").addEventListener("click", () => {
  if (!allPrompts.length) { toast("No data to export"); return; }
  const headers = ["timestamp", "text", "intentCategory", "outsourcingRisk", "confidence", "subject", "intervention", "site"];
  const rows = allPrompts.map((p) => headers.map((h) => {
    let val = String(p[h] || "");
    if (val.includes(",") || val.includes('"') || val.includes("\n")) val = '"' + val.replace(/"/g, '""') + '"';
    return val;
  }).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `think-export-${new Date().toISOString().split("T")[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast("Exported");
});

// ── Profile ──
async function loadProfile() {
  const res = await msg("GET_PROFILE");
  if (res?.error) return;
  const p = res?.profile || {};
  document.getElementById("profName").value = p.displayName || "";
  document.getElementById("profStatus").value = p.currentStatus || "";
  document.getElementById("profClasses").value = Array.isArray(p.classes) ? p.classes.join(", ") : p.classes || "";
  document.getElementById("profDifficulty").value = p.difficulty || "high_school";
  document.getElementById("profSensitivity").value = p.sensitivity || 2;
  renderKnowledge(p.dynamicKnowledge || {});
}

document.getElementById("saveProfile").addEventListener("click", async () => {
  const existing = (await msg("GET_PROFILE"))?.profile || {};
  const classesRaw = document.getElementById("profClasses").value.trim();
  const status = document.getElementById("profStatus").value.trim();
  const profile = {
    ...existing,
    displayName: document.getElementById("profName").value.trim(),
    currentStatus: status,
    classes: classesRaw.split(",").map((c) => c.trim()).filter(Boolean),
    difficulty: document.getElementById("profDifficulty").value,
    sensitivity: parseInt(document.getElementById("profSensitivity").value),
  };
  // Also cache status locally
  chrome.storage.sync.set({ currentStatus: status });
  const res = await msg("SAVE_PROFILE", { profile });
  toast(res?.error ? "Error: " + res.error : "Saved");
});

// ── Knowledge Map (with editing) ──
let currentDK = {};

function renderKnowledge(dk) {
  currentDK = dk;
  const grid = document.getElementById("knowledgeGrid");
  const entries = Object.entries(dk);
  if (!entries.length) { grid.innerHTML = '<div class="empty">Populates as you use AI tools. Or add manually below.</div>'; return; }
  grid.innerHTML = entries
    .sort((a, b) => (b[1].promptCount || 0) - (a[1].promptCount || 0))
    .map(([subj, d]) =>
      `<div class="knowledge-chip">
        <button class="remove-btn" data-subject="${subj}" title="Remove">&times;</button>
        <h4>${subj}</h4>
        <div class="kc">${d.promptCount || 0} prompts</div>
        ${d.topics?.length ? `<div class="kt">${d.topics.slice(-6).join(" / ")}</div>` : ""}
      </div>`
    ).join("");

  // Attach remove handlers
  grid.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const subj = btn.dataset.subject;
      if (!confirm(`Remove "${subj}" from your knowledge map?`)) return;
      delete currentDK[subj];
      await saveKnowledge();
      renderKnowledge(currentDK);
      toast("Removed " + subj);
    });
  });
}

// Add knowledge entry
document.getElementById("addKnowledgeBtn").addEventListener("click", async () => {
  const subj = document.getElementById("addSubject").value.trim().toLowerCase();
  if (!subj) return;
  const topic = document.getElementById("addTopic").value.trim();
  if (!currentDK[subj]) currentDK[subj] = { promptCount: 0, topics: [] };
  if (topic && !currentDK[subj].topics.includes(topic)) {
    currentDK[subj].topics.push(topic);
  }
  await saveKnowledge();
  renderKnowledge(currentDK);
  document.getElementById("addSubject").value = "";
  document.getElementById("addTopic").value = "";
  toast("Added " + subj);
});

async function saveKnowledge() {
  const existing = (await msg("GET_PROFILE"))?.profile || {};
  existing.dynamicKnowledge = currentDK;
  await msg("SAVE_PROFILE", { profile: existing });
}

// ── Init ──
(async () => {
  const ok = await initAuth();
  if (ok) await Promise.all([loadOverview(), loadProfile()]);
})();
