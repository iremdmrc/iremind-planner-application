const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const FALLBACK_AVATAR = "";

const STATUS_LABELS = {
  ONLINE: "Online",
  STUDYING: "Studying",
  IDLE: "Idle",
  DND: "Do not disturb",
  INVISIBLE: "Invisible",
};

const STATUS_ICONS = {
  ONLINE: "fa-check",
  STUDYING: "fa-book-open",
  IDLE: "fa-moon",
  DND: "fa-minus",
  INVISIBLE: "fa-circle",
};

let currentUser = null;
let pendingAvatar = null;
let pendingBanner = null;

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
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("is-error", isError);
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function applyPreview() {
  const avatarPreview = document.querySelector("#avatar-preview");
  const bannerPreview = document.querySelector("#banner-preview");
  const bannerClearBtn = document.querySelector("#banner-clear-btn");

  const avatarUrl = pendingAvatar ?? currentUser?.avatarUrl ?? FALLBACK_AVATAR;
  if (avatarPreview) {
    const avatarButton = avatarPreview.closest(".profile-card-avatar");
    if (avatarUrl) {
      avatarPreview.src = avatarUrl;
      avatarPreview.hidden = false;
      avatarButton?.classList.remove("is-empty-avatar");
    } else {
      avatarPreview.removeAttribute("src");
      avatarPreview.hidden = true;
      avatarButton?.classList.add("is-empty-avatar");
      if (avatarButton) {
        avatarButton.dataset.initial = (currentUser?.displayName || currentUser?.email || "U").trim().charAt(0).toUpperCase() || "U";
      }
    }
  }

  const bannerUrl = pendingBanner !== undefined ? pendingBanner : currentUser?.bannerUrl;
  if (bannerPreview) {
    if (bannerUrl) {
      bannerPreview.style.backgroundImage = `url("${bannerUrl}")`;
      bannerPreview.classList.add("has-banner");
      if (bannerClearBtn) bannerClearBtn.hidden = false;
    } else {
      bannerPreview.style.backgroundImage = "";
      bannerPreview.classList.remove("has-banner");
      if (bannerClearBtn) bannerClearBtn.hidden = true;
    }
  }

  const nameEl = document.querySelector("#profile-card-name");
  if (nameEl) {
    nameEl.textContent = (document.querySelector("#settings-name")?.value
      || currentUser?.displayName || "Profile").trim() || "Profile";
  }

  const aboutEl = document.querySelector("#profile-card-about");
  if (aboutEl) {
    const aboutVal = document.querySelector("#settings-about")?.value?.trim();
    aboutEl.textContent = aboutVal || currentUser?.about || "No about text yet.";
  }

  const status = document.querySelector("#settings-status")?.value || "ONLINE";
  const statusEl = document.querySelector("#profile-card-status");
  if (statusEl) {
    statusEl.className = `profile-card-status status-${status}`;
    const iconClass = STATUS_ICONS[status] || "fa-check";
    statusEl.innerHTML = `
      <span class="profile-status-icon"><i class="fas ${iconClass}"></i></span>
      ${STATUS_LABELS[status] || "Online"}
    `;
  }

  const counter = document.querySelector("#about-counter");
  if (counter) {
    const len = document.querySelector("#settings-about")?.value.length || 0;
    counter.textContent = `${len} / 240`;
  }
}

function setStatus(value) {
  const hidden = document.querySelector("#settings-status");
  if (hidden) hidden.value = value;
  document.querySelectorAll(".status-option").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.status === value);
  });
  applyPreview();
}

async function loadProfile() {
  const data = await request("/api/me");
  currentUser = data.user;
  document.querySelector("#settings-name").value = currentUser.displayName || "";
  document.querySelector("#settings-email").value = currentUser.email || "";
  document.querySelector("#settings-about").value = currentUser.about || "";
  document.querySelector("#settings-avatar-size").value = currentUser.avatarSize || 72;
  setStatus(currentUser.status || "ONLINE");
  pendingAvatar = null;
  pendingBanner = undefined;
  applyPreview();
}

document.querySelector("#profile-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = {
      displayName: document.querySelector("#settings-name").value.trim(),
      email: document.querySelector("#settings-email").value.trim(),
      about: document.querySelector("#settings-about").value.trim(),
      status: document.querySelector("#settings-status").value,
      avatarSize: Number(document.querySelector("#settings-avatar-size").value),
    };
    if (pendingAvatar !== null) payload.avatarUrl = pendingAvatar;
    if (pendingBanner !== undefined) payload.bannerUrl = pendingBanner;

    const data = await request("/api/me/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    currentUser = data.user;
    pendingAvatar = null;
    pendingBanner = undefined;
    localStorage.setItem("user", JSON.stringify(data.user));
    applyPreview();
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

/* ---------- Manual photo & banner upload ---------- */

async function handleFile(input, kind) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showMessage("#profile-message", `${kind === "banner" ? "Banner" : "Photo"} must be smaller than 2 MB.`, true);
    return;
  }
  try {
    const dataUrl = await readImageAsDataUrl(file);
    if (kind === "avatar") pendingAvatar = dataUrl;
    if (kind === "banner") pendingBanner = dataUrl;
    applyPreview();
    showMessage("#profile-message", `${kind === "banner" ? "Banner" : "Photo"} ready — click "Save profile" to apply.`);
  } catch (err) {
    showMessage("#profile-message", err.message, true);
  }
}

const avatarInput = document.querySelector("#avatar-file-input");
const bannerInput = document.querySelector("#banner-file-input");

avatarInput?.addEventListener("change", () => handleFile(avatarInput, "avatar"));
bannerInput?.addEventListener("change", () => handleFile(bannerInput, "banner"));

document.querySelector("#avatar-edit-btn")?.addEventListener("click", () => avatarInput?.click());
document.querySelector("#banner-edit-btn")?.addEventListener("click", () => bannerInput?.click());

document.querySelectorAll(".profile-upload-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    if (target === "avatar") avatarInput?.click();
    if (target === "banner") bannerInput?.click();
  });
});

document.querySelector("#banner-clear-btn")?.addEventListener("click", () => {
  pendingBanner = null; // null tells server to clear
  applyPreview();
  showMessage("#profile-message", `Banner will be removed when you save.`);
});

/* ---------- Status picker + live preview ---------- */

document.querySelectorAll(".status-option").forEach((btn) => {
  btn.addEventListener("click", () => setStatus(btn.dataset.status));
});

["#settings-name", "#settings-about"].forEach((sel) => {
  document.querySelector(sel)?.addEventListener("input", applyPreview);
});

loadProfile().catch((err) => showMessage("#profile-message", err.message, true));
