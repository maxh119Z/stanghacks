function msg(type, data = {}) {
  return new Promise((r) => chrome.runtime.sendMessage({ type, ...data }, r));
}

// ── Load auth state ──
async function loadAuth() {
  const auth = await msg("GET_AUTH");

  if (auth && auth.loggedIn) {
    document.getElementById("loggedOutView").classList.add("hidden");
    document.getElementById("loggedInView").classList.remove("hidden");
    document.getElementById("userName").textContent = auth.displayName || "User";
    document.getElementById("userEmail").textContent = auth.email || "";
    if (auth.photoUrl) {
      document.getElementById("userAvatar").src = auth.photoUrl;
    }
  } else {
    document.getElementById("loggedOutView").classList.remove("hidden");
    document.getElementById("loggedInView").classList.add("hidden");
  }
}
loadAuth();

// ── Google Sign In ──
document.getElementById("googleSignInBtn").addEventListener("click", async () => {
  const btn = document.getElementById("googleSignInBtn");
  btn.textContent = "Signing in...";
  btn.disabled = true;

  const res = await msg("GOOGLE_SIGN_IN");

  if (res && res.error) {
    btn.textContent = "Sign in with Google";
    btn.disabled = false;
    alert("Sign in failed: " + res.error);
    return;
  }

  if (res && res.needsOnboarding) {
    // New user - open onboarding page
    await msg("OPEN_PAGE", { page: "onboarding.html" });
    window.close();
  } else {
    // Existing user - just reload popup
    loadAuth();
    btn.textContent = "Sign in with Google";
    btn.disabled = false;
  }
});

// ── Sign Out ──
document.getElementById("signOutBtn").addEventListener("click", async () => {
  await msg("SIGN_OUT");
  loadAuth();
});

// ── Load settings ──
chrome.storage.sync.get(["apiKey", "enabled"], (data) => {
  if (data.apiKey) document.getElementById("apiKey").value = data.apiKey;
  document.getElementById("enabled").checked = data.enabled !== false;
});

// ── Load stats ──
msg("GET_STATS", { days: 1 }).then((res) => {
  if (res?.stats?.[0]) {
    document.getElementById("statTotal").textContent = res.stats[0].total || 0;
    document.getElementById("statNudged").textContent = res.stats[0].nudged || 0;
    document.getElementById("statClean").textContent = res.stats[0].allowed || 0;
  }
});

// ── Save ──
document.getElementById("saveBtn").addEventListener("click", () => {
  chrome.storage.sync.set({
    apiKey: document.getElementById("apiKey").value.trim(),
    enabled: document.getElementById("enabled").checked,
  }, () => {
    const btn = document.getElementById("saveBtn");
    btn.textContent = "Saved \u2713";
    btn.style.background = "linear-gradient(135deg, #10b981, #059669)";
    setTimeout(() => { btn.textContent = "Save"; btn.style.background = ""; }, 1200);
  });
});

// ── Dashboard ──
document.getElementById("dashboardBtn").addEventListener("click", () => {
  msg("OPEN_PAGE", { page: "dashboard.html" });
});

// ── Reset ──
document.getElementById("resetBtn").addEventListener("click", () => {
  chrome.storage.local.set({ sessionStats: { total: 0, nudged: 0, allowed: 0, categories: {}, subjects: {} } });
  document.getElementById("statTotal").textContent = "0";
  document.getElementById("statNudged").textContent = "0";
  document.getElementById("statClean").textContent = "0";
});
