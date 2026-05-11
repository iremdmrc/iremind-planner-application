// ===============================
//  Iremind AUTH.JS (Tek Dosya)
// ===============================

// ---- Backend adresi ----
const API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_API_BASE ||
      (import.meta.env.VITE_API_URL && `${import.meta.env.VITE_API_URL}/api/auth`))) ||
  "http://localhost:5000/api/auth";

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

const translations = {
  en: { loginTitle: "Login to Iremind", loginSubtitle: "Welcome back! Please enter your details.", registerTitle: "Sign Up For Free.", registerSubtitle: "Find balance in your mind.", email: "Email", password: "Password", username: "Username", fullName: "Full Name", signIn: "Sign in", signUp: "SIGN UP", noAccount: "No account?", registerNow: "Register now", haveAccount: "Already have an account?", emailPlaceholder: "Enter your email address", passwordPlaceholder: "Enter your password" },
  tr: { loginTitle: "Iremind'e Giris Yap", loginSubtitle: "Tekrar hos geldin. Bilgilerini gir.", registerTitle: "Ucretsiz Kaydol.", registerSubtitle: "Zihninde denge bul.", email: "E-posta", password: "Sifre", username: "Kullanici adi", fullName: "Ad Soyad", signIn: "Giris yap", signUp: "KAYDOL", noAccount: "Hesabin yok mu?", registerNow: "Simdi kaydol", haveAccount: "Zaten hesabin var mi?", emailPlaceholder: "E-posta adresini gir", passwordPlaceholder: "Sifreni gir" },
  es: { loginTitle: "Iniciar sesion en Iremind", loginSubtitle: "Bienvenido de nuevo. Ingresa tus datos.", registerTitle: "Registrate gratis.", registerSubtitle: "Encuentra equilibrio en tu mente.", email: "Correo", password: "Contrasena", username: "Usuario", fullName: "Nombre completo", signIn: "Iniciar sesion", signUp: "REGISTRARSE", noAccount: "No tienes cuenta?", registerNow: "Registrate", haveAccount: "Ya tienes cuenta?", emailPlaceholder: "Ingresa tu correo", passwordPlaceholder: "Ingresa tu contrasena" },
  fr: { loginTitle: "Connexion a Iremind", loginSubtitle: "Bon retour. Entrez vos informations.", registerTitle: "Inscription gratuite.", registerSubtitle: "Trouvez l'equilibre dans votre esprit.", email: "E-mail", password: "Mot de passe", username: "Nom d'utilisateur", fullName: "Nom complet", signIn: "Se connecter", signUp: "S'INSCRIRE", noAccount: "Pas de compte ?", registerNow: "Creer un compte", haveAccount: "Deja un compte ?", emailPlaceholder: "Entrez votre e-mail", passwordPlaceholder: "Entrez votre mot de passe" },
  de: { loginTitle: "Bei Iremind anmelden", loginSubtitle: "Willkommen zuruck. Gib deine Daten ein.", registerTitle: "Kostenlos registrieren.", registerSubtitle: "Finde Balance in deinem Kopf.", email: "E-Mail", password: "Passwort", username: "Benutzername", fullName: "Vollstandiger Name", signIn: "Anmelden", signUp: "REGISTRIEREN", noAccount: "Noch kein Konto?", registerNow: "Jetzt registrieren", haveAccount: "Schon ein Konto?", emailPlaceholder: "E-Mail eingeben", passwordPlaceholder: "Passwort eingeben" },
};

function applyAuthTheme() {
  document.documentElement.dataset.authTheme = localStorage.getItem("iremindAuthTheme") || "light";
}

function applyLanguage() {
  const lang = localStorage.getItem("iremindLanguage") || "en";
  const dictionary = translations[lang] || translations.en;
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = dictionary[node.dataset.i18n] || node.textContent;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = dictionary[node.dataset.i18nPlaceholder] || node.placeholder;
  });
}

function setupAuthSettings() {
  document.querySelectorAll("[data-auth-theme]").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.setItem("iremindAuthTheme", button.dataset.authTheme);
      if (button.dataset.authTheme === "dark") {
        localStorage.setItem("iremindTheme", "dark");
      } else if (localStorage.getItem("iremindTheme") === "dark") {
        localStorage.setItem("iremindTheme", "warm");
      }
      applyAuthTheme();
    });
  });
  document.querySelectorAll("[data-auth-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      localStorage.setItem("iremindLanguage", button.dataset.authLang);
      applyLanguage();
    });
  });
  applyAuthTheme();
  applyLanguage();
}

document.addEventListener("DOMContentLoaded", () => {
  setupAuthSettings();
  setupLoginForm();
  setupRegisterForm();
});
