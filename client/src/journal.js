const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

let entries = [];
let editingId = null;
let pendingDeleteId = null;

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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function resetEditor() {
  editingId = null;
  document.querySelector("#journal-title").value = "";
  document.querySelector("#journal-content").value = "";
  document.querySelector("#journal-mood").value = "calm";
}

function renderEntries() {
  const list = document.querySelector("#journal-list");
  if (!entries.length) {
    list.innerHTML = `<article class="journal-entry-card empty-card"><h3>No journal entries yet</h3><p>Write your first reflection and it will stay saved to your account.</p></article>`;
    return;
  }

  list.innerHTML = entries.map((entry) => `
    <article class="journal-entry-card">
      <div class="journal-entry-top">
        <span>${escapeHtml(entry.mood || "calm")}</span>
        <time>${formatDate(entry.updatedAt)}</time>
      </div>
      <h3>${escapeHtml(entry.title)}</h3>
      <p>${escapeHtml(entry.content)}</p>
      <div class="note-actions">
        <button class="tiny-btn" data-edit-journal="${escapeHtml(entry.id)}">Edit</button>
        <button class="tiny-btn" data-delete-journal="${escapeHtml(entry.id)}">Delete</button>
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-edit-journal]").forEach((button) => {
    button.addEventListener("click", () => editEntry(button.dataset.editJournal));
  });
  document.querySelectorAll("[data-delete-journal]").forEach((button) => {
    button.addEventListener("click", () => openDelete(button.dataset.deleteJournal));
  });
}

async function loadEntries() {
  const data = await request("/api/journal");
  entries = data.entries || [];
  renderEntries();
}

function editEntry(id) {
  const entry = entries.find((item) => item.id === id);
  if (!entry) return;
  editingId = id;
  document.querySelector("#journal-title").value = entry.title;
  document.querySelector("#journal-content").value = entry.content;
  document.querySelector("#journal-mood").value = entry.mood || "calm";
}

function openDelete(id) {
  pendingDeleteId = id;
  const entry = entries.find((item) => item.id === id);
  document.querySelector("#delete-journal-title").textContent = `Delete "${entry?.title || "this entry"}"?`;
  document.querySelector("#delete-journal-modal").hidden = false;
}

function closeDelete() {
  pendingDeleteId = null;
  document.querySelector("#delete-journal-modal").hidden = true;
}

async function confirmDelete() {
  if (!pendingDeleteId) return;
  await request(`/api/journal/${pendingDeleteId}`, { method: "DELETE" });
  if (editingId === pendingDeleteId) resetEditor();
  closeDelete();
  await loadEntries();
}

async function saveEntry(event) {
  event.preventDefault();
  const title = document.querySelector("#journal-title").value.trim() || "Journal entry";
  const content = document.querySelector("#journal-content").value.trim();
  const mood = document.querySelector("#journal-mood").value;

  if (!content) {
    alert("Write something first.");
    return;
  }

  if (editingId) {
    await request(`/api/journal/${editingId}`, {
      method: "PATCH",
      body: JSON.stringify({ title, content, mood }),
    });
  } else {
    await request("/api/journal", {
      method: "POST",
      body: JSON.stringify({ title, content, mood }),
    });
  }

  resetEditor();
  await loadEntries();
}

document.querySelector("#journal-form")?.addEventListener("submit", (event) => {
  saveEntry(event).catch((err) => alert(err.message));
});
document.querySelector("#journal-clear")?.addEventListener("click", resetEditor);
document.querySelector("#cancel-delete-journal-btn")?.addEventListener("click", closeDelete);
document.querySelector("#confirm-delete-journal-btn")?.addEventListener("click", () => {
  confirmDelete().catch((err) => alert(err.message));
});
document.querySelector("#delete-journal-modal")?.addEventListener("click", (event) => {
  if (event.target.id === "delete-journal-modal") closeDelete();
});

loadEntries().catch((err) => alert(err.message));
