const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const FALLBACK_AVATAR = "./images/avatar.jpg";

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

  document.querySelectorAll(".user-profile img, .profile-avatar-img").forEach((img) => {
    img.src = avatar;
    img.alt = `${firstName(user)} profile photo`;
  });

  document.querySelectorAll("[data-user-name]").forEach((node) => {
    node.textContent = firstName(user);
  });

  const welcome = document.querySelector("#welcome-message");
  if (welcome) {
    welcome.textContent = `${greetingForHour(new Date().getHours())}, ${firstName(user)}. Welcome back to Iremind.`;
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

async function initShell() {
  applySavedTheme();
  attachLogout();

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
}

initShell().catch((err) => console.warn(err.message));
