const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const FALLBACK_AVATAR = "";

function applySavedTheme() {
  const authTheme = localStorage.getItem("iremindAuthTheme");
  const theme = localStorage.getItem("iremindTheme") || (authTheme === "dark" ? "dark" : "warm");
  document.documentElement.dataset.theme = theme;
}

function getToken() {
  return localStorage.getItem("accessToken");
}

function greetingForHour(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(user) {
  return (user?.displayName || user?.email || "there").split(/[ @]/)[0];
}

async function api(path, options = {}) {
  const token = getToken();
  if (!token) {
    window.location.href = "/index.html";
    return null;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      window.location.href = "/index.html";
      return null;
    }
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function setStoredUser(user) {
  if (user) localStorage.setItem("user", JSON.stringify(user));
}

function updateUserUi(user) {
  const avatar = user?.avatarUrl || FALLBACK_AVATAR;
  const avatarSize = Math.max(48, Math.min(Number(user?.avatarSize) || 72, 120));

  document.querySelectorAll(".user-profile img, .profile-avatar-img").forEach((img) => {
    const wrapper = img.closest(".user-profile") || img.parentElement;
    if (avatar) {
      img.src = avatar;
      img.hidden = false;
      wrapper?.classList.remove("is-empty-avatar");
    } else {
      img.removeAttribute("src");
      img.hidden = true;
      wrapper?.classList.add("is-empty-avatar");
      if (wrapper && !wrapper.dataset.initial) {
        wrapper.dataset.initial = firstName(user).charAt(0).toUpperCase() || "U";
      }
    }
    img.alt = `${firstName(user)} profile photo`;
    if (img.closest(".user-profile") || img.classList.contains("profile-avatar-img")) {
      img.style.width = "100%";
      img.style.height = "100%";
      if (wrapper?.classList.contains("user-profile") || wrapper?.classList.contains("profile-avatar-img")) {
        wrapper.style.width = `${avatarSize}px`;
        wrapper.style.height = `${avatarSize}px`;
      }
    }
  });

  document.querySelectorAll("[data-user-name]").forEach((node) => {
    node.textContent = firstName(user);
  });

  const welcome = document.querySelector("#welcome-message");
  if (welcome) {
    welcome.textContent = `${greetingForHour(new Date().getHours())}, ${firstName(user)}. Welcome back to Iremind.`;
  }
}

function linkSidebarUtilities() {
  document.querySelectorAll(".menu-item").forEach((item) => {
    const text = item.textContent.trim().toLowerCase();
    if (text.startsWith("reminder") && item.tagName !== "A") {
      item.addEventListener("click", () => { window.location.href = "reminder.html"; });
      item.setAttribute("role", "link");
      item.tabIndex = 0;
    }
    if (text.startsWith("chats") && item.tagName !== "A") {
      item.addEventListener("click", () => { window.location.href = "chat.html"; });
      item.setAttribute("role", "link");
      item.tabIndex = 0;
    }
  });
}

async function updateChatBadge() {
  const badge = [...document.querySelectorAll(".menu-item-badge")]
    .find((node) => node.closest(".menu-item")?.textContent.toLowerCase().includes("chats"));
  if (!badge || !getToken()) return;
  try {
    const data = await api("/api/chat/unread-count");
    const count = data?.count || 0;
    badge.textContent = count;
    badge.hidden = count === 0;
  } catch {
    badge.hidden = true;
  }
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function attachAvatarUpload(user) {
  const targets = document.querySelectorAll(".user-profile, .profile-uploader");
  if (!targets.length) return;

  targets.forEach((target) => {
    target.setAttribute("title", "Change profile photo");
    target.setAttribute("role", "button");
    target.tabIndex = 0;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    target.appendChild(input);
    input.addEventListener("click", (event) => event.stopPropagation());

    const openPicker = () => input.click();
    target.addEventListener("click", openPicker);
    target.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") openPicker();
    });

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        alert("Please choose an image smaller than 2 MB.");
        input.value = "";
        return;
      }

      try {
        const avatarUrl = await readImageAsDataUrl(file);
        const data = await api("/api/me/profile", {
          method: "PATCH",
          body: JSON.stringify({ avatarUrl }),
        });
        setStoredUser(data.user);
        updateUserUi(data.user);
      } catch (err) {
        alert(err.message);
      } finally {
        input.value = "";
      }
    });
  });
}

function attachLogout() {
  document.querySelectorAll('a[href="index.html"], a[href="/index.html"]').forEach((link) => {
    if (!link.textContent.toLowerCase().includes("log out")) return;
    link.addEventListener("click", () => {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
    });
  });
}

/* ============================================================
   GLOBAL TOAST NOTIFICATION SYSTEM
   Shows real-time toasts in the bottom-right of any page.
   - Reminders that come due (polled every 60s)
   - Incoming chat messages (via SSE) when not on the chat page
   ============================================================ */
const TOAST_SHOWN_KEY = "iremindToastShown";

function ensureToastStack() {
  let stack = document.querySelector("#iremind-toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "iremind-toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}

function escapeToastHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast({ kind = "info", icon = "fa-bell", title = "", body = "", tag = "", linkHref, duration = 5000 }) {
  const stack = ensureToastStack();

  // Avoid duplicates currently on screen with the same tag
  if (tag) {
    const existing = stack.querySelector(`[data-toast-tag="${CSS.escape(tag)}"]`);
    if (existing) return;
  }

  const toast = document.createElement("div");
  toast.className = `iremind-toast toast-${kind}`;
  if (tag) toast.dataset.toastTag = tag;
  toast.innerHTML = `
    <div class="iremind-toast-icon"><i class="fas ${icon}"></i></div>
    <div class="iremind-toast-content">
      <div class="iremind-toast-title">
        ${escapeToastHtml(title)}
        ${tag ? `<small>${escapeToastHtml(tag)}</small>` : ""}
      </div>
      <p class="iremind-toast-body">${escapeToastHtml(body)}</p>
    </div>
    <button class="iremind-toast-close" type="button" aria-label="Dismiss">
      <i class="fas fa-times"></i>
    </button>
    <div class="iremind-toast-progress" style="animation-duration:${duration}ms"></div>
  `;

  const dismiss = () => {
    if (toast.classList.contains("is-leaving")) return;
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 320);
  };

  toast.querySelector(".iremind-toast-close").addEventListener("click", dismiss);
  if (linkHref) {
    toast.style.cursor = "pointer";
    toast.addEventListener("click", (event) => {
      if (event.target.closest(".iremind-toast-close")) return;
      window.location.href = linkHref;
    });
  }

  stack.appendChild(toast);
  setTimeout(dismiss, duration);
}

function loadShownToasts() {
  try {
    const raw = sessionStorage.getItem(TOAST_SHOWN_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function persistShownToasts(set) {
  try {
    // Cap so it never grows unbounded
    const arr = Array.from(set).slice(-200);
    sessionStorage.setItem(TOAST_SHOWN_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

function relativeMinutes(value) {
  return Math.round((new Date(value).getTime() - Date.now()) / 60000);
}

function formatDueLabel(value) {
  const minutes = relativeMinutes(value);
  if (minutes < -1) return `${Math.abs(minutes)} min overdue`;
  if (minutes <= 0) return "Now";
  if (minutes < 60) return `In ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `In ${hours}h`;
}

async function pollReminderToasts() {
  if (!getToken()) return;
  try {
    const data = await api("/api/reminders");
    if (!data?.reminders) return;
    const shown = loadShownToasts();
    const now = Date.now();

    for (const item of data.reminders) {
      if (item.completed) continue;
      const dueMs = new Date(item.dueAt).getTime();
      const diff = dueMs - now;
      // Only fire when reminder is due within the next 15 min OR up to 30 min overdue
      if (diff > 15 * 60 * 1000) continue;
      if (diff < -30 * 60 * 1000) continue;
      const tag = `reminder:${item.id}`;
      if (shown.has(tag)) continue;
      const isEvent = item.sourceType === "EVENT";
      showToast({
        kind: isEvent ? "event" : "task",
        icon: isEvent ? "fa-calendar-day" : "fa-list-check",
        title: item.title || "Reminder",
        body: `${formatDueLabel(item.dueAt)} · ${item.note || (isEvent ? "Calendar event" : "To-do task")}`,
        tag: isEvent ? "Event" : "Task",
        linkHref: "reminder.html",
        duration: 6500,
      });
      shown.add(tag);
    }
    persistShownToasts(shown);
  } catch (err) {
    // Silent fail — no need to disturb the user
    console.warn("reminder toast poll failed", err.message || err);
  }
}

let chatStreamSource = null;

function initChatStreamToasts() {
  if (chatStreamSource) return;
  const token = getToken();
  if (!token) return;
  // Only show chat toasts when NOT on the chat page (it has its own stream)
  if (location.pathname.endsWith("chat.html")) return;
  try {
    chatStreamSource = new EventSource(`${API_URL}/api/chat/stream?token=${encodeURIComponent(token)}`);
    chatStreamSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type !== "message") return;
        const msg = payload.message;
        const me = JSON.parse(localStorage.getItem("user") || "null");
        if (!me || msg.senderId === me.id) return;
        const senderName = msg.sender?.displayName || "New message";
        showToast({
          kind: "message",
          icon: "fa-comment-dots",
          title: senderName,
          body: msg.body || "",
          tag: "Message",
          linkHref: "chat.html",
          duration: 6000,
        });
        updateChatBadge();
      } catch {
        /* ignore malformed payloads */
      }
    };
    chatStreamSource.onerror = () => {
      // Browser auto-retries; nothing to do
    };
  } catch (err) {
    console.warn("chat stream toast failed", err.message || err);
  }
}

// Expose so individual pages (e.g. reminder, chat) can fire custom toasts
window.iremindToast = showToast;

async function initShell() {
  applySavedTheme();
  attachLogout();
  linkSidebarUtilities();

  const cached = localStorage.getItem("user");
  if (cached) {
    try {
      updateUserUi(JSON.parse(cached));
    } catch {
      localStorage.removeItem("user");
    }
  }

  const data = await api("/api/me");
  if (!data?.user) return;
  setStoredUser(data.user);
  updateUserUi(data.user);
  attachAvatarUpload(data.user);
  updateChatBadge();

  // Real-time notification systems
  ensureToastStack();
  pollReminderToasts();
  setInterval(pollReminderToasts, 60_000);
  initChatStreamToasts();
}

initShell().catch((err) => console.warn(err.message));
