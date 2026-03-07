function msg(type, data = {}) {
  return new Promise((r) => chrome.runtime.sendMessage({ type, ...data }, r));
}
function toast(m) {
  const el = document.getElementById("toast");
  el.textContent = m; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2000);
}

// ── Tabs ──
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.panel).classList.add("active");
  });
});

// ── Auth ──
async function initAuth() {
  const auth = await msg("GET_AUTH");
  if (!auth || !auth.loggedIn) {
    document.getElementById("navEmail").textContent = "Not logged in (local mode)";
    document.getElementById("navSignout").style.display = "none";
    return;
  }
  document.getElementById("navEmail").textContent = auth.displayName || auth.email;
  if (auth.photoUrl) {
    const av = document.getElementById("navAvatar");
    av.src = auth.photoUrl; av.style.display = "block";
  }
}

document.getElementById("navSignout").addEventListener("click", async () => {
  await msg("SIGN_OUT");
  location.reload();
});

// ── Overview ──
async function loadOverview() {
  const res = await msg("GET_STATS", { days: 7 });
  if (!res?.stats) return;
  const stats = res.stats;

  const totalAll = stats.reduce((s, d) => s + (d.total || 0), 0);
  const nudgedAll = stats.reduce((s, d) => s + (d.nudged || 0), 0);
  const cleanAll = stats.reduce((s, d) => s + (d.allowed || 0), 0);

  document.getElementById("oTotal").textContent = totalAll;
  document.getElementById("oNudged").textContent = nudgedAll;
  document.getElementById("oClean").textContent = cleanAll;
  document.getElementById("oRate").textContent = totalAll > 0 ? Math.round((nudgedAll / totalAll) * 100) + "%" : "0%";

  // Bar chart
  const chart = document.getElementById("weekChart");
  chart.innerHTML = "";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const ordered = [...stats].reverse();
  const maxVal = Math.max(...ordered.map((d) => d.total || 0), 1);

  ordered.forEach((day) => {
    const g = document.createElement("div"); g.className = "bar-group";
    const cBar = document.createElement("div"); cBar.className = "bar clean";
    cBar.style.height = Math.max(2, ((day.allowed || 0) / maxVal) * 130) + "px";
    cBar.title = `Clean: ${day.allowed || 0}`;
    const nBar = document.createElement("div"); nBar.className = "bar nudged";
    nBar.style.height = Math.max(2, ((day.nudged || 0) / maxVal) * 130) + "px";
    nBar.title = `Nudged: ${day.nudged || 0}`;
    const lbl = document.createElement("div"); lbl.className = "bar-label";
    const d = new Date(day.date); lbl.textContent = isNaN(d) ? "?" : days[d.getDay()];
    g.appendChild(cBar); g.appendChild(nBar); g.appendChild(lbl);
    chart.appendChild(g);
  });

  // Category + subject breakdowns (aggregate 7 days)
  const allCats = {}, allSubjects = {};
  stats.forEach((d) => {
    for (const [k, v] of Object.entries(d.categories || {})) allCats[k] = (allCats[k] || 0) + v;
    for (const [k, v] of Object.entries(d.subjects || {})) allSubjects[k] = (allSubjects[k] || 0) + v;
  });
  renderBreakdown("catBreakdown", allCats);
  renderBreakdown("subjBreakdown", allSubjects);
}

function renderBreakdown(id, data) {
  const el = document.getElementById(id);
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  el.innerHTML = entries.map(([name, count]) => `
    <div class="cat-row">
      <div class="cat-name">${name.replace(/_/g, " ")}</div>
      <div class="cat-bar-bg"><div class="cat-bar-fill" style="width:${(count / max) * 100}%"></div></div>
      <div class="cat-count">${count}</div>
    </div>
  `).join("");
}

// ── Profile ──
async function loadProfile() {
  const res = await msg("GET_PROFILE");
  const p = res?.profile || {};
  document.getElementById("profName").value = p.displayName || "";
  document.getElementById("profClasses").value = Array.isArray(p.classes) ? p.classes.join(", ") : p.classes || "";
  document.getElementById("profDifficulty").value = p.difficulty || "high_school";
  document.getElementById("profSensitivity").value = p.sensitivity || 2;
  renderKnowledge(p.dynamicKnowledge || {});
}

document.getElementById("saveProfile").addEventListener("click", async () => {
  const existing = (await msg("GET_PROFILE"))?.profile || {};
  const classesRaw = document.getElementById("profClasses").value.trim();
  const profile = {
    ...existing,
    displayName: document.getElementById("profName").value.trim(),
    classes: classesRaw.split(",").map((c) => c.trim()).filter(Boolean),
    difficulty: document.getElementById("profDifficulty").value,
    sensitivity: parseInt(document.getElementById("profSensitivity").value),
  };
  const res = await msg("SAVE_PROFILE", { profile });
  toast(res?.error ? "Error: " + res.error : "Profile saved!");
});

// ── Knowledge Map ──
function renderKnowledge(dk) {
  const grid = document.getElementById("knowledgeGrid");
  const entries = Object.entries(dk);
  if (!entries.length) return;
  grid.innerHTML = entries
    .sort((a, b) => (b[1].promptCount || 0) - (a[1].promptCount || 0))
    .map(([subj, d]) => `
      <div class="knowledge-chip">
        <h4>${subj}</h4>
        <div class="kc">${d.promptCount || 0} prompts</div>
        ${d.topics?.length ? `<div class="kt">${d.topics.slice(-6).join(" · ")}</div>` : ""}
      </div>
    `).join("");
}

// ── Init ──
(async () => {
  await initAuth();
  await Promise.all([loadOverview(), loadProfile()]);
})();
