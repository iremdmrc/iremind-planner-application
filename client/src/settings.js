const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function token() {
  const value = localStorage.getItem("accessToken");
  if (!value) window.location.href = "/index.html";
  return value;
}

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function showMessage(id, text, isError = false) {
  const node = document.querySelector(id);
  node.textContent = text;
  node.classList.toggle("is-error", isError);
}

async function loadProfile() {
  const data = await request("/api/me");
  document.querySelector("#settings-name").value = data.user.displayName || "";
  document.querySelector("#settings-email").value = data.user.email || "";
}

document.querySelector("#profile-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await request("/api/me/profile", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: document.querySelector("#settings-name").value.trim(),
        email: document.querySelector("#settings-email").value.trim(),
      }),
    });
    localStorage.setItem("user", JSON.stringify(data.user));
    showMessage("#profile-message", "Profile saved.");
  } catch (err) {
    showMessage("#profile-message", err.message, true);
  }
});

document.querySelector("#password-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await request("/api/me/password", {
      method: "PATCH",
      body: JSON.stringify({
        currentPassword: document.querySelector("#current-password").value,
        newPassword: document.querySelector("#new-password").value,
      }),
    });
    event.target.reset();
    showMessage("#password-message", "Password changed.");
  } catch (err) {
    showMessage("#password-message", err.message, true);
  }
});

function setTheme(theme) {
  localStorage.setItem("iremindTheme", theme);
  localStorage.setItem("iremindAuthTheme", theme === "dark" ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.themeChoice === theme);
  });
}

document.querySelectorAll("[data-theme-choice]").forEach((button) => {
  button.addEventListener("click", () => setTheme(button.dataset.themeChoice));
});

setTheme(localStorage.getItem("iremindTheme") || "warm");
loadProfile().catch((err) => showMessage("#profile-message", err.message, true));
