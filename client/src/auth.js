// ===============================
//  Iremind AUTH.JS (Tek Dosya)
// ===============================

// ---- Backend adresi ----
const API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE) ||
  "http://localhost:5000/auth";

// ---- JSON POST helper ----
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await r.json();
  } catch {
    // JSON dönmezse data null kalır, sorun değil
  }

  if (!r.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `${r.status} ${r.statusText}`;
    throw new Error(msg);
  }
  return data || {};
}

// ---- Token kaydetme ----
function saveTokens(data) {
  if (data?.accessToken) localStorage.setItem("accessToken", data.accessToken);
  if (data?.refreshToken)
    localStorage.setItem("refreshToken", data.refreshToken);
  if (data?.user) localStorage.setItem("user", JSON.stringify(data.user));
}

// ---- Hata kutusunu bul (DOM'a hiç yeni şey EKLEME) ----
function findErrorBox(form) {
  return form.querySelector(".error") || null;
}

// ===============================
//  LOGIN FORM BİNDING
// ===============================
function setupLoginForm() {
  const form = document.querySelector("#login-form");
  if (!form) return; // Sayfa login değilse geç

  const emailEl = form.querySelector('input[name="email"]');
  const passEl = form.querySelector('input[name="password"]');
  const errBox = findErrorBox(form);
  const btn = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (errBox) errBox.textContent = "";
    if (btn) btn.disabled = true;

    const email = emailEl?.value.trim() || "";
    const password = passEl?.value.trim() || "";

    try {
      const data = await postJSON(`${API_BASE}/login`, {
        email,
        password,
      });

      saveTokens(data);

      // Başarılı giriş → dashboard'a gönder
      window.location.href = "/dashboard.html";
    } catch (err) {
      if (errBox) errBox.textContent = err.message || "Login failed";
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

// ===============================
//  REGISTER FORM BİNDING
// ===============================
function setupRegisterForm() {
  const form = document.querySelector("#register-form");
  if (!form) return; // Sayfa register değilse geç

  const emailEl = form.querySelector('input[name="email"]');
  const passEl = form.querySelector('input[name="password"]');

  // Senin HTML'ine göre:
  const fullNameEl = form.querySelector('input[name="fullname"]');
  const fNameEl = form.querySelector('input[name="firstName"]');
  const lNameEl = form.querySelector('input[name="lastName"]');

  const errBox = findErrorBox(form);
  const btn = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (errBox) errBox.textContent = "";
    if (btn) btn.disabled = true;

    const email = emailEl?.value.trim() || "";
    const password = passEl?.value.trim() || "";

    const full = fullNameEl?.value?.trim() || "";
    const first = fNameEl?.value?.trim() || "";
    const last = lNameEl?.value?.trim() || "";

    // display_name öncelik: fullname > first+last > email
    const display_name = full || `${first} ${last}`.trim() || email;

    try {
      const data = await postJSON(`${API_BASE}/register`, {
        email,
        password,
        display_name,
      });

      saveTokens(data);

      // Başarılı kayıt → Dashboard
      window.location.href = "/dashboard.html";
    } catch (err) {
      if (errBox) errBox.textContent = err.message || "Register failed";
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

// ===============================
//  SAYFAYI OTOMATİK ALGILA
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  setupLoginForm();
  setupRegisterForm();
});
