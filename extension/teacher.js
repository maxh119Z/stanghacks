function msg(type, data = {}) { return new Promise((r) => chrome.runtime.sendMessage({ type, ...data }, r)); }
function toast(m) { const el = document.getElementById("toast"); el.textContent = m; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2000); }

let currentClassId = null;
let currentClassData = null;
let currentStudents = [];

// ── Auth ──
(async () => {
  const auth = await msg("GET_AUTH");
  if (!auth || !auth.loggedIn) {
    document.querySelector(".container").innerHTML = '<div style="text-align:center;padding:60px;color:#6a6a6a;">Sign in via the Think popup.</div>';
    return;
  }
  if (auth.role !== "teacher") {
    document.querySelector(".container").innerHTML = '<div style="text-align:center;padding:60px;color:#6a6a6a;">This dashboard is for teacher accounts only.</div>';
    return;
  }
  document.getElementById("navEmail").textContent = auth.displayName || auth.email;
  loadClasses();
})();

document.getElementById("navSignout").addEventListener("click", async () => { await msg("SIGN_OUT"); location.reload(); });

// ── Views ──
function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ── Class List ──
async function loadClasses() {
  showView("viewClasses");
  const res = await msg("GET_MY_CLASSES");
  const el = document.getElementById("classList");
  const classes = res?.classes || [];
  if (!classes.length) { el.innerHTML = '<div class="empty">No classes yet. Create one above.</div>'; return; }
  el.innerHTML = classes.map(c => `
    <div class="class-item" data-id="${c.id}">
      <div>
        <div class="ci-name">${c.name}</div>
        <div class="ci-meta">${c.studentCount || 0} students &middot; Created ${new Date(c.createdAt).toLocaleDateString()}</div>
      </div>
      <div class="ci-code">${c.code}</div>
    </div>
  `).join("");
  el.querySelectorAll(".class-item").forEach(item => {
    item.addEventListener("click", () => openClassDetail(item.dataset.id));
  });
}

// ── Create Class ──
document.getElementById("createClassBtn").addEventListener("click", async () => {
  const name = document.getElementById("newClassName").value.trim();
  if (!name) { toast("Enter a class name"); return; }
  const btn = document.getElementById("createClassBtn"); btn.textContent = "Creating..."; btn.disabled = true;
  const res = await msg("CREATE_CLASS", { name });
  btn.textContent = "Create"; btn.disabled = false;
  if (res?.error) { toast(res.error); return; }
  document.getElementById("newClassName").value = "";
  toast("Created! Code: " + res.classData.code);
  loadClasses();
});

// ── Class Detail ──
async function openClassDetail(classId) {
  currentClassId = classId;
  showView("viewClassDetail");
  const el = document.getElementById("studentList");
  el.innerHTML = '<div class="empty">Loading students...</div>';

  const res = await msg("GET_CLASS_DETAIL", { classId });
  if (res?.error) { el.innerHTML = `<div class="empty">${res.error}</div>`; return; }

  currentClassData = res.classData;
  currentStudents = res.students;

  document.getElementById("classDetailName").textContent = currentClassData.name;
  document.getElementById("classDetailMeta").textContent = `Code: ${currentClassData.code} | ${currentStudents.length} student${currentStudents.length !== 1 ? "s" : ""}`;

  if (!currentStudents.length) { el.innerHTML = '<div class="empty">No students have joined yet. Share the code: ' + currentClassData.code + '</div>'; return; }

  el.innerHTML = `<table class="student-table">
    <thead><tr><th>Name</th><th>Total</th><th>Clean</th><th>Flagged</th><th>Nudge Rate</th></tr></thead>
    <tbody>${currentStudents.map(s => {
      const rate = s.stats.total > 0 ? Math.round((s.stats.nudged / s.stats.total) * 100) : 0;
      return `<tr data-uid="${s.uid}"><td>${s.name}</td><td>${s.stats.total}</td><td>${s.stats.allowed}</td><td class="${s.stats.nudged > 0 ? 'flagged' : ''}">${s.stats.nudged}</td><td>${rate}%</td></tr>`;
    }).join("")}</tbody>
  </table>`;

  el.querySelectorAll("tr[data-uid]").forEach(row => {
    row.addEventListener("click", () => openStudentDetail(row.dataset.uid));
  });
}

// ── Export Class CSV ──
document.getElementById("exportClassCsv").addEventListener("click", () => {
  if (!currentStudents.length) { toast("No data"); return; }
  const headers = ["Name", "Email", "Total Prompts", "Clean", "Flagged", "Nudge Rate"];
  const rows = currentStudents.map(s => {
    const rate = s.stats.total > 0 ? Math.round((s.stats.nudged / s.stats.total) * 100) + "%" : "0%";
    return [s.name, s.email, s.stats.total, s.stats.allowed, s.stats.nudged, rate].join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `${(currentClassData?.name || "class").replace(/\s+/g, "-")}-report.csv`;
  a.click();
  toast("Exported");
});

// ── Student Detail ──
async function openStudentDetail(uid) {
  showView("viewStudentDetail");
  document.getElementById("studentPrompts").innerHTML = '<div class="empty">Loading...</div>';

  const dataRes = await msg("GET_STUDENT_DATA", { studentUid: uid, days: 7 });
  document.getElementById("studentName").textContent = dataRes.name || "Student";

  const s = dataRes.stats;
  const rate = s.total > 0 ? Math.round((s.nudged / s.total) * 100) : 0;
  document.getElementById("studentStats").innerHTML = `
    <div class="sm"><div class="num">${s.total}</div><div class="label">Total</div></div>
    <div class="sm"><div class="num">${s.nudged}</div><div class="label">Flagged</div></div>
    <div class="sm"><div class="num">${rate}%</div><div class="label">Nudge Rate</div></div>
  `;

  renderBD("studentCats", s.categories || {});
  renderBD("studentSubjects", s.subjects || {});

  // Flagged prompts
  const flagRes = await msg("GET_STUDENT_FLAGGED", { studentUid: uid });
  const prompts = flagRes?.prompts || [];
  const el = document.getElementById("studentPrompts");
  if (!prompts.length) { el.innerHTML = '<div class="empty">No flagged prompts</div>'; return; }

  el.innerHTML = `<table class="prompt-table">
    <thead><tr><th>Time</th><th>Prompt</th><th>Category</th><th>Subject</th><th>Risk</th></tr></thead>
    <tbody>${prompts.map(p => {
      const time = p.timestamp ? new Date(p.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "?";
      const rc = p.outsourcingRisk === "high" ? "risk-high" : "risk-medium";
      const flagged = p.outsourcingRisk === "high" ? "flagged-row" : "";
      return `<tr class="${flagged}"><td style="white-space:nowrap;font-size:11px;color:#6a6a6a;">${time}</td><td class="prompt-text" title="${(p.text || "").replace(/"/g, '&quot;')}">${p.text || ""}</td><td><span class="tag">${(p.intentCategory || "").replace(/_/g, " ")}</span></td><td style="text-transform:capitalize;">${p.subject || ""}</td><td><span class="tag ${rc}">${(p.outsourcingRisk || "").toUpperCase()}</span></td></tr>`;
    }).join("")}</tbody>
  </table>`;
}

function renderBD(id, data) {
  const el = document.getElementById(id); const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!entries.length) { el.innerHTML = '<span style="color:#6a6a6a;font-size:12px;">No data</span>'; return; }
  const max = Math.max(...entries.map(([, v]) => v), 1);
  el.innerHTML = entries.map(([n, c]) => `<div class="cat-row"><div class="cat-name">${n.replace(/_/g, " ")}</div><div class="cat-bar-bg"><div class="cat-bar-fill" style="width:${(c / max) * 100}%"></div></div><div class="cat-count">${c}</div></div>`).join("");
}

// ── Navigation ──
document.getElementById("backToClasses").addEventListener("click", () => loadClasses());
document.getElementById("backToClass").addEventListener("click", () => { if (currentClassId) openClassDetail(currentClassId); else loadClasses(); });
