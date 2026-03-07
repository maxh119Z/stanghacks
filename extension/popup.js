function msg(type, data = {}) { return new Promise((r) => chrome.runtime.sendMessage({ type, ...data }, r)); }

async function loadAuth() {
  const auth = await msg("GET_AUTH");
  if (auth && auth.loggedIn) {
    document.getElementById("loggedOutView").classList.add("hidden");
    document.getElementById("loggedInView").classList.remove("hidden");
    document.getElementById("statusBar").classList.remove("hidden");
    document.getElementById("userName").textContent = auth.displayName || "User";
    document.getElementById("userEmail").textContent = auth.email || "";
    if (auth.photoUrl) document.getElementById("userAvatar").src = auth.photoUrl;

    // Show teacher button if teacher
    if (auth.role === "teacher") {
      document.getElementById("teacherBtn").classList.remove("hidden");
    }

    // Load status + stats
    const profileRes = await msg("GET_PROFILE");
    if (profileRes?.profile?.currentStatus) {
      document.getElementById("currentStatus").value = profileRes.profile.currentStatus;
    }
    const statsRes = await msg("GET_STATS", { days: 1 });
    if (statsRes?.stats?.[0]) {
      document.getElementById("statTotal").textContent = statsRes.stats[0].total || 0;
      document.getElementById("statNudged").textContent = statsRes.stats[0].nudged || 0;
      document.getElementById("statClean").textContent = statsRes.stats[0].allowed || 0;
    }
  } else {
    document.getElementById("loggedOutView").classList.remove("hidden");
    document.getElementById("loggedInView").classList.add("hidden");
    document.getElementById("statusBar").classList.add("hidden");
  }
}
loadAuth();

// ── Google Sign In ──
document.getElementById("googleSignInBtn").addEventListener("click", async () => {
  const btn = document.getElementById("googleSignInBtn");
  btn.textContent = "Signing in..."; btn.disabled = true;
  const res = await msg("GOOGLE_SIGN_IN");
  if (res && res.error) { btn.textContent = "Sign in with Google"; btn.disabled = false; alert("Sign in failed: " + res.error); return; }
  if (res && res.needsOnboarding) { await msg("OPEN_PAGE", { page: "onboarding.html" }); window.close(); }
  else { loadAuth(); btn.textContent = "Sign in with Google"; btn.disabled = false; }
});

document.getElementById("signOutBtn").addEventListener("click", async () => { await msg("SIGN_OUT"); loadAuth(); });

// ── Status ──
document.getElementById("statusSaveBtn").addEventListener("click", async () => {
  const status = document.getElementById("currentStatus").value.trim();
  const btn = document.getElementById("statusSaveBtn"); btn.textContent = "...";
  await msg("SAVE_STATUS", { status });
  btn.textContent = "Set";
});
document.getElementById("currentStatus").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("statusSaveBtn").click(); });

// ── Settings ──
chrome.storage.sync.get(["apiKey", "enabled"], (data) => {
  if (data.apiKey) document.getElementById("apiKey").value = data.apiKey;
  document.getElementById("enabled").checked = data.enabled !== false;
});

// FIX: Toggle saves immediately on change
document.getElementById("enabled").addEventListener("change", (e) => {
  const checked = e.target.checked;
  chrome.storage.sync.set({ enabled: checked }, () => {
    console.log("[Think] Active toggled:", checked);
  });
});

// ── Save API Key ──
document.getElementById("saveBtn").addEventListener("click", () => {
  chrome.storage.sync.set({
    apiKey: document.getElementById("apiKey").value.trim(),
    enabled: document.getElementById("enabled").checked,
  }, () => {
    const btn = document.getElementById("saveBtn");
    btn.textContent = "Saved"; btn.style.background = "#3db89f";
    setTimeout(() => { btn.textContent = "Save"; btn.style.background = ""; }, 1200);
  });
});

// ── Nav buttons ──
document.getElementById("dashboardBtn").addEventListener("click", () => msg("OPEN_PAGE", { page: "dashboard.html" }));
document.getElementById("teacherBtn").addEventListener("click", () => msg("OPEN_PAGE", { page: "teacher.html" }));

// ── Reset (Firebase) ──
document.getElementById("resetBtn").addEventListener("click", async () => {
  if (!confirm("Reset all stats? This clears your Firebase data for the last 30 days.")) return;
  const btn = document.getElementById("resetBtn"); btn.textContent = "Resetting...";
  await msg("RESET_STATS");
  document.getElementById("statTotal").textContent = "0";
  document.getElementById("statNudged").textContent = "0";
  document.getElementById("statClean").textContent = "0";
  btn.textContent = "Reset all stats";
});
