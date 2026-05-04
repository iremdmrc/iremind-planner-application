const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

let notes = [];
let editingId = null;
let selectedSticker = "sparkle";
let search = "";
let pendingDeleteId = null;

const stickerLabels = {
  sparkle: "✨",
  heart: "💗",
  star: "⭐",
  flower: "🌸",
  bookmark: "🔖",
};

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

function decoratedContent(note) {
  const content = note.content || "";
  const marker = content.match(/^\[sticker:([a-z]+)(?::(-?\d+):(-?\d+))?\]\n?/);
  return {
    sticker: marker?.[1] || "sparkle",
    stickerX: Number(marker?.[2] ?? 18),
    stickerY: Number(marker?.[3] ?? 18),
    content: marker ? content.replace(marker[0], "") : content,
  };
}

function stickerMarker(sticker, x = 18, y = 18) {
  return `[sticker:${sticker}:${Math.round(x)}:${Math.round(y)}]`;
}

function filteredNotes() {
  const term = search.trim().toLowerCase();
  if (!term) return notes;
  return notes.filter((note) => `${note.title} ${decoratedContent(note).content}`.toLowerCase().includes(term));
}

function renderNotes() {
  const board = document.querySelector("#notes-board");
  const visible = filteredNotes();
  if (!board) return;

  if (!visible.length) {
    board.innerHTML = `
      <article class="note-card empty-note-card">
        <span class="note-sticker-static">✨</span>
        <h3>No notes yet</h3>
        <p>Create your first clean study note.</p>
      </article>
    `;
    return;
  }

  board.innerHTML = visible.map((note) => {
    const deco = decoratedContent(note);
    return `
      <article class="note-card">
        <button
          class="note-sticker draggable-sticker"
          type="button"
          data-sticker-note="${escapeHtml(note.id)}"
          style="left:${deco.stickerX}px;top:${deco.stickerY}px"
          title="Drag sticker"
        >${escapeHtml(stickerLabels[deco.sticker] || "✦")}</button>
        <div class="note-actions note-actions-top">
          <button class="tiny-btn icon-note-btn" data-edit-note="${escapeHtml(note.id)}" title="Edit note"><i class="fas fa-pen"></i></button>
          <button class="tiny-btn icon-note-btn" data-delete-note="${escapeHtml(note.id)}" title="Delete note"><i class="fas fa-trash"></i></button>
        </div>
        <h3>${escapeHtml(note.title)}</h3>
        <p>${escapeHtml(deco.content)}</p>
        <small>${new Date(note.updatedAt || note.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</small>
      </article>
    `;
  }).join("");

  document.querySelectorAll("[data-edit-note]").forEach((button) => {
    button.addEventListener("click", () => editNote(button.dataset.editNote));
  });
  document.querySelectorAll("[data-delete-note]").forEach((button) => {
    button.addEventListener("click", () => deleteNote(button.dataset.deleteNote));
  });
  bindStickerDragging();
}

async function loadNotes() {
  const data = await request("/api/notes");
  notes = data.notes || [];
  renderNotes();
}

function editNote(id) {
  const note = notes.find((item) => item.id === id);
  if (!note) return;
  const deco = decoratedContent(note);
  editingId = id;
  selectedSticker = deco.sticker;
  document.querySelector("#note-title").value = note.title;
  document.querySelector("#note-content").value = deco.content;
  updateStickerButtons();
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
  selectedSticker = "sparkle";
  document.querySelector("#note-title").value = "";
  document.querySelector("#note-content").value = "";
  updateStickerButtons();
}

function updateStickerButtons() {
  document.querySelectorAll("[data-sticker]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.sticker === selectedSticker);
  });
}

async function saveNote() {
  const title = document.querySelector("#note-title").value.trim() || "Untitled note";
  const rawContent = document.querySelector("#note-content").value.trim();
  const existing = editingId ? decoratedContent(notes.find((item) => item.id === editingId) || {}) : null;
  const content = `${stickerMarker(selectedSticker, existing?.stickerX ?? 18, existing?.stickerY ?? 18)}\n${rawContent}`;

  if (!rawContent) {
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

function bindStickerDragging() {
  document.querySelectorAll("[data-sticker-note]").forEach((sticker) => {
    sticker.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const card = sticker.closest(".note-card");
      const note = notes.find((item) => item.id === sticker.dataset.stickerNote);
      if (!card || !note) return;

      const deco = decoratedContent(note);
      const cardRect = card.getBoundingClientRect();
      const stickerRect = sticker.getBoundingClientRect();
      const offsetX = event.clientX - stickerRect.left;
      const offsetY = event.clientY - stickerRect.top;

      sticker.setPointerCapture(event.pointerId);
      sticker.classList.add("is-dragging");

      const move = (moveEvent) => {
        const x = Math.max(8, Math.min(cardRect.width - stickerRect.width - 8, moveEvent.clientX - cardRect.left - offsetX));
        const y = Math.max(8, Math.min(cardRect.height - stickerRect.height - 8, moveEvent.clientY - cardRect.top - offsetY));
        sticker.style.left = `${x}px`;
        sticker.style.top = `${y}px`;
      };

      const up = async () => {
        sticker.classList.remove("is-dragging");
        sticker.removeEventListener("pointermove", move);
        sticker.removeEventListener("pointerup", up);
        const x = parseInt(sticker.style.left, 10) || 18;
        const y = parseInt(sticker.style.top, 10) || 18;
        const content = `${stickerMarker(deco.sticker, x, y)}\n${deco.content}`;
        try {
          await request(`/api/notes/${note.id}`, {
            method: "PATCH",
            body: JSON.stringify({ content }),
          });
          note.content = content;
        } catch (err) {
          alert(err.message);
        }
      };

      sticker.addEventListener("pointermove", move);
      sticker.addEventListener("pointerup", up);
    });
  });
}

document.querySelector("#save-note-btn")?.addEventListener("click", () => saveNote().catch((err) => alert(err.message)));
document.querySelector("#note-search")?.addEventListener("input", (event) => {
  search = event.target.value;
  renderNotes();
});
document.querySelectorAll("[data-sticker]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedSticker = button.dataset.sticker;
    updateStickerButtons();
  });
});
document.querySelector("#cancel-delete-note-btn")?.addEventListener("click", closeDeleteModal);
document.querySelector("#delete-note-modal")?.addEventListener("click", (event) => {
  if (event.target.id === "delete-note-modal") closeDeleteModal();
});
document.querySelector("#confirm-delete-note-btn")?.addEventListener("click", () => {
  confirmDeleteNote().catch((err) => alert(err.message));
});

loadNotes().catch((err) => alert(err.message));
