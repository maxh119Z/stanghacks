function msg(type, data = {}) {
  return new Promise((r) => chrome.runtime.sendMessage({ type, ...data }, r));
}

(async () => {
  const auth = await msg("GET_AUTH");
  if (auth && auth.loggedIn) {
    document.getElementById("displayName").value = auth.displayName || "";
    if (auth.photoUrl) {
      document.getElementById("previewAvatar").src = auth.photoUrl;
      document.getElementById("previewName").textContent = auth.displayName || "";
      document.getElementById("previewEmail").textContent = auth.email || "";
      document.getElementById("userPreview").style.display = "flex";
    }
  }
})();

document.getElementById("saveBtn").addEventListener("click", async () => {
  const btn = document.getElementById("saveBtn");
  const errorEl = document.getElementById("errorMsg");
  errorEl.style.display = "none";

  const classesRaw = document.getElementById("classes").value.trim();
  if (!classesRaw) {
    errorEl.textContent = "Please enter at least one class.";
    errorEl.style.display = "block";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Saving...";

  const status = document.getElementById("currentStatusOnboard").value.trim();

  const profile = {
    displayName: document.getElementById("displayName").value.trim(),
    classes: classesRaw.split(",").map((c) => c.trim()).filter(Boolean),
    difficulty: document.getElementById("difficulty").value,
    sensitivity: parseInt(document.getElementById("sensitivity").value),
  };

  const res = await msg("SAVE_ONBOARDING", { profile });

  if (res && res.error) {
    errorEl.textContent = res.error;
    errorEl.style.display = "block";
    btn.disabled = false;
    btn.textContent = "Start Thinking";
    return;
  }

  // Save status separately if provided
  if (status) {
    await msg("SAVE_STATUS", { status });
  }

  document.getElementById("formCard").innerHTML = `
    <div class="success">
      <h2>You're all set.</h2>
      <p>Think is now active. Head to ChatGPT, Claude, or Gemini and start prompting.</p>
      <p style="margin-top: 14px; color: #6a6a6a; font-size: 12px;">You can close this tab.</p>
    </div>
  `;
});
