// ── Tab switching ──
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const isSignup = tab.dataset.tab === "signup";
    document.getElementById("signupForm").style.display = isSignup ? "block" : "none";
    document.getElementById("loginForm").style.display = isSignup ? "none" : "block";
    hideError();
  });
});

function showError(msg) {
  const el = document.getElementById("errorMsg");
  el.textContent = msg;
  el.style.display = "block";
}
function hideError() {
  document.getElementById("errorMsg").style.display = "none";
}
function showSuccess(msg) {
  const el = document.getElementById("successMsg");
  el.innerHTML = msg;
  el.style.display = "block";
}

// ── Sign Up ──
document.getElementById("signupBtn").addEventListener("click", async () => {
  hideError();
  const btn = document.getElementById("signupBtn");
  btn.disabled = true;
  btn.textContent = "Creating account...";

  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const displayName = document.getElementById("displayName").value.trim();
  const classesRaw = document.getElementById("classes").value.trim();
  const difficulty = document.getElementById("difficulty").value;

  if (!email || !password) {
    showError("Email and password are required.");
    btn.disabled = false;
    btn.textContent = "Create Account & Start";
    return;
  }
  if (password.length < 6) {
    showError("Password must be at least 6 characters.");
    btn.disabled = false;
    btn.textContent = "Create Account & Start";
    return;
  }

  const classes = classesRaw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  chrome.runtime.sendMessage(
    {
      type: "SIGN_UP",
      email,
      password,
      profile: { displayName, classes, difficulty },
    },
    (res) => {
      if (res && res.error) {
        showError(res.error);
        btn.disabled = false;
        btn.textContent = "Create Account & Start";
      } else {
        document.querySelector(".card").innerHTML = `
          <div style="text-align:center; padding: 30px 0;">
            <p>Success</p>
          </div>
        `;
      }
    }
  );
});

// ── Login ──
document.getElementById("loginBtn").addEventListener("click", async () => {
  hideError();
  const btn = document.getElementById("loginBtn");
  btn.disabled = true;
  btn.textContent = "Logging in...";

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    showError("Email and password are required.");
    btn.disabled = false;
    btn.textContent = "Log In";
    return;
  }

  chrome.runtime.sendMessage({ type: "SIGN_IN", email, password }, (res) => {
    if (res && res.error) {
      showError(res.error);
      btn.disabled = false;
      btn.textContent = "Log In";
    } else {
      document.querySelector(".card").innerHTML = `
        <div style="text-align:center; padding: 30px 0;">
          <div style="font-size: 48px; margin-bottom: 16px;">👋</div>
          <h2 style="font-size: 20px; margin-bottom: 8px;">Welcome back!</h2>
          <p style="color: #94a3b8; font-size: 14px;">
            Your profile is synced. You can close this tab.
          </p>
        </div>
      `;
    }
  });
});
