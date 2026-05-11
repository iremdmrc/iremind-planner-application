const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

let notes = [];
let editingId = null;
let search = "";
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

function cleanContent(note) {
  const content = note.content || "";
  return content.replace(/^\[sticker:([a-z]+)(?::(-?\d+):(-?\d+))?\]\n?/, "");
}

function filteredNotes() {
  const term = search.trim().toLowerCase();
  if (!term) return notes;
  return notes.filter((note) => `${note.title} ${cleanContent(note)}`.toLowerCase().includes(term));
}

function renderNotes() {
  const board = document.querySelector("#notes-board");
  const visible = filteredNotes();
  if (!board) return;

  if (!visible.length) {
    board.innerHTML = `
      <article class="note-card empty-note-card">
        <h3>No notes yet</h3>
        <p>Create your first clean study note.</p>
      </article>
    `;
    return;
  }

  board.innerHTML = visible.map((note) => `
    <article class="note-card">
      <div class="note-actions note-actions-top">
        <button class="tiny-btn icon-note-btn" data-edit-note="${escapeHtml(note.id)}" title="Edit note"><i class="fas fa-pen"></i></button>
        <button class="tiny-btn icon-note-btn" data-delete-note="${escapeHtml(note.id)}" title="Delete note"><i class="fas fa-trash"></i></button>
      </div>
      <h3>${escapeHtml(note.title)}</h3>
      <p>${escapeHtml(cleanContent(note))}</p>
      <small>${new Date(note.updatedAt || note.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</small>
    </article>
  `).join("");

  document.querySelectorAll("[data-edit-note]").forEach((button) => {
    button.addEventListener("click", () => editNote(button.dataset.editNote));
  });
  document.querySelectorAll("[data-delete-note]").forEach((button) => {
    button.addEventListener("click", () => deleteNote(button.dataset.deleteNote));
  });
}

async function loadNotes() {
  const data = await request("/api/notes");
  notes = data.notes || [];
  renderNotes();
}

function editNote(id) {
  const note = notes.find((item) => item.id === id);
  if (!note) return;
  editingId = id;
  document.querySelector("#note-title").value = note.title;
  document.querySelector("#note-content").value = cleanContent(note);
}

async function deleteNote(id) {
  pendingDeleteId = id;
  const note = notes.find((item) => item.id === id);
  const title = document.querySelector("#delete-note-title");
  const modal = document.querySelector("#delete-note-modal");
  if (title) title.textContent = `Delete "${note?.title || "this note"}"?`;
  if (modal) modal.hidden = false;
}

async function confirmDeleteNote() {
  if (!pendingDeleteId) return;
  await request(`/api/notes/${pendingDeleteId}`, { method: "DELETE" });
  if (editingId === pendingDeleteId) resetEditor();
  closeDeleteModal();
  await loadNotes();
}

function closeDeleteModal() {
  pendingDeleteId = null;
  const modal = document.querySelector("#delete-note-modal");
  if (modal) modal.hidden = true;
}

function resetEditor() {
  editingId = null;
  document.querySelector("#note-title").value = "";
  document.querySelector("#note-content").value = "";
}

async function saveNote() {
  const title = document.querySelector("#note-title").value.trim() || "Untitled note";
  const content = document.querySelector("#note-content").value.trim();

  if (!content) {
    alert("Write something first.");
    return;
  }

  if (editingId) {
    await request(`/api/notes/${editingId}`, {
      method: "PATCH",
      body: JSON.stringify({ title, content }),
    });
  } else {
    await request("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title, content }),
    });
  }

  resetEditor();
  await loadNotes();
}

document.querySelector("#save-note-btn")?.addEventListener("click", () => saveNote().catch((err) => alert(err.message)));
document.querySelector("#note-search")?.addEventListener("input", (event) => {
  search = event.target.value;
  renderNotes();
});
document.querySelector("#cancel-delete-note-btn")?.addEventListener("click", closeDeleteModal);
document.querySelector("#delete-note-modal")?.addEventListener("click", (event) => {
  if (event.target.id === "delete-note-modal") closeDeleteModal();
});
document.querySelector("#confirm-delete-note-btn")?.addEventListener("click", () => {
  confirmDeleteNote().catch((err) => alert(err.message));
});

loadNotes().catch((err) => alert(err.message));
