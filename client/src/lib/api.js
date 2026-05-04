// client/src/lib/api.js
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Server JSON dönmedi: " + text.slice(0, 200));
  }
}

export async function apiPost(path, body) {
  console.log("🌐 apiPost URL =", API_URL + path);
  console.log("🌐 apiPost body =", body);

  const res = await fetch(API_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await parseJsonSafe(res);

  if (!res.ok) {
    throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  }

  return data;
}

export async function apiGet(path) {
  const token = localStorage.getItem("accessToken");
  const res = await fetch(API_URL + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  return data;
}
