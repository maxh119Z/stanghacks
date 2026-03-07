// Load saved settings
chrome.storage.sync.get(
  ["apiKey", "classes", "difficulty", "sensitivity", "enabled"],
  (data) => {
    if (data.apiKey) document.getElementById("apiKey").value = data.apiKey;
    if (data.classes) document.getElementById("classes").value = data.classes;
    if (data.difficulty) document.getElementById("difficulty").value = data.difficulty;
    if (data.sensitivity) document.getElementById("sensitivity").value = data.sensitivity;
    document.getElementById("enabled").checked = data.enabled !== false;
  }
);

// Load stats
chrome.storage.local.get("sessionStats", (data) => {
  const stats = data.sessionStats || { total: 0, blocked: 0, allowed: 0 };
  document.getElementById("stat-total").textContent = stats.total;
  document.getElementById("stat-nudged").textContent = stats.blocked;
  document.getElementById("stat-clean").textContent = stats.allowed;
});

// Save
document.getElementById("saveBtn").addEventListener("click", () => {
  const settings = {
    apiKey: document.getElementById("apiKey").value.trim(),
    classes: document.getElementById("classes").value.trim(),
    difficulty: document.getElementById("difficulty").value,
    sensitivity: document.getElementById("sensitivity").value,
    enabled: document.getElementById("enabled").checked,
  };

  chrome.storage.sync.set(settings, () => {
    const btn = document.getElementById("saveBtn");
    btn.textContent = "Saved ✓";
    btn.classList.add("saved");
    setTimeout(() => {
      btn.textContent = "Save Settings";
      btn.classList.remove("saved");
    }, 1500);
  });
});

// Reset stats
document.getElementById("resetStats").addEventListener("click", () => {
  chrome.storage.local.set({
    sessionStats: { total: 0, blocked: 0, allowed: 0, categories: {} },
  });
  document.getElementById("stat-total").textContent = "0";
  document.getElementById("stat-nudged").textContent = "0";
  document.getElementById("stat-clean").textContent = "0";
});
