function msg(type, data = {}) { return new Promise((r) => chrome.runtime.sendMessage({ type, ...data }, r)); }

let selectedRole = "student";

// ── Pre-fill from Google ──
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

// ── Role picker ──
document.querySelectorAll(".role-card").forEach((card) => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".role-card").forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
    selectedRole = card.dataset.role;
    document.getElementById("studentFields").classList.toggle("visible", selectedRole === "student");
    document.getElementById("teacherFields").classList.toggle("visible", selectedRole === "teacher");
  });
});

// ── Save ──
document.getElementById("saveBtn").addEventListener("click", async () => {
  const btn = document.getElementById("saveBtn");
  const errorEl = document.getElementById("errorMsg");
  errorEl.style.display = "none";

  if (selectedRole === "student") {
    const classesRaw = document.getElementById("classes").value.trim();
    if (!classesRaw) {
      errorEl.textContent = "Please enter at least one class.";
      errorEl.style.display = "block";
      return;
    }
  }

  btn.disabled = true;
  btn.textContent = "Saving...";

  const profile = {
    role: selectedRole,
    displayName: document.getElementById("displayName").value.trim(),
  };

  if (selectedRole === "student") {
    profile.classes = document.getElementById("classes").value.trim().split(",").map((c) => c.trim()).filter(Boolean);
    profile.difficulty = document.getElementById("difficulty").value;
    profile.sensitivity = parseInt(document.getElementById("sensitivity").value);
  } else {
    profile.classes = [];
    profile.difficulty = "high_school";
    profile.sensitivity = 2;
  }

  const res = await msg("SAVE_ONBOARDING", { profile });

  if (res && res.error) {
    errorEl.textContent = res.error;
    errorEl.style.display = "block";
    btn.disabled = false;
    btn.textContent = "Get Started";
    return;
  }

  // Save status if student
  if (selectedRole === "student") {
    const status = document.getElementById("currentStatusOnboard").value.trim();
    if (status) await msg("SAVE_STATUS", { status });
  }

  const successMsg = selectedRole === "teacher"
    ? "You're all set. Open the Teacher Dashboard from the popup to create your first class."
    : "Think is now active. Head to ChatGPT, Claude, or Gemini and start prompting.";

  document.getElementById("formCard").innerHTML = `
    <div class="success">
      <h2>You're all set.</h2>
      <p>${successMsg}</p>
      <p style="margin-top: 14px; color: #6a6a6a; font-size: 12px;">You can close this tab.</p>
    </div>
  `;
});
