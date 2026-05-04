const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

let currentTasks = [];
let currentSearch = "";
let currentFilter = "all";
let currentView = "kanban";

const KANBAN_COLUMNS = [
  { status: "TODO", title: "New task", accent: "blue" },
  { status: "WORKING", title: "In progress", accent: "mint" },
  { status: "DONE", title: "Completed", accent: "gray" },
];

function getToken() {
  return localStorage.getItem("accessToken");
}

function requireLogin() {
  const token = getToken();

  if (!token) {
    window.location.href = "/index.html";
    return null;
  }

  return token;
}

async function request(path, options = {}) {
  const token = requireLogin();
  if (!token) return null;

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
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function apiGet(path) {
  return request(path);
}

function apiPost(path, body) {
  return request(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function apiPatch(path, body) {
  return request(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function apiDelete(path) {
  return request(path, { method: "DELETE" });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function highlightText(value) {
  const safe = escapeHtml(value);
  const term = currentSearch.trim();

  if (!term) return safe;

  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(`(${escapedTerm})`, "gi"), '<mark class="search-hit">$1</mark>');
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.isFocus !== b.isFocus) return a.isFocus ? -1 : 1;
    if (a.status === "DONE" && b.status !== "DONE") return 1;
    if (a.status !== "DONE" && b.status === "DONE") return -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function getTaskDate(task) {
  return task.dueDate ? new Date(task.dueDate) : new Date(task.createdAt);
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isThisWeek(date) {
  const today = new Date();
  const start = new Date(today);
  const day = today.getDay() || 7;
  start.setDate(today.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return date >= start && date < end;
}

function matchesFilter(task) {
  const status = task.status || "TODO";
  const taskDate = getTaskDate(task);
  const today = new Date();

  if (currentFilter === "completed") return status === "DONE";
  if (currentFilter === "today") return status !== "DONE" && isSameDay(taskDate, today);
  if (currentFilter === "week") return status !== "DONE" && isThisWeek(taskDate);
  if (currentFilter === "upcoming") return status !== "DONE" && taskDate > today && !isSameDay(taskDate, today);
  return true;
}

function getVisibleTasks() {
  const term = currentSearch.trim().toLowerCase();
  const sorted = sortTasks(currentTasks).filter(matchesFilter);

  if (!term) return sorted;

  return sorted.filter((task) => {
    return `${task.title || ""} ${task.note || ""} ${task.priority || ""} ${task.status || ""}`
      .toLowerCase()
      .includes(term);
  });
}

function boardStatus(task) {
  const status = task.status || "TODO";
  return status === "STUCK" ? "TODO" : status;
}

function taskCardMarkup(task, mode = "kanban") {
  const priority = task.priority || "MEDIUM";
  const status = task.status || "TODO";
  const isDone = status === "DONE";
  const isKanban = mode === "kanban";

  return `
    <article
      class="task-card ${isKanban ? "kanban-task-card" : "table-task-card"} ${task.isFocus ? "is-focus" : ""} ${isDone ? "is-done" : ""}"
      ${isKanban ? `draggable="true" data-drag-task-id="${escapeHtml(task.id)}"` : ""}
    >
      <div class="task-main">
        <div class="task-title-row">
          <span class="task-avatar">${escapeHtml((task.title || "T").trim().charAt(0).toUpperCase())}</span>
          <h3>${highlightText(task.title)}</h3>
          <div class="task-actions">
            <button class="task-icon-btn ${task.isFocus ? "is-active" : ""}" data-focus-id="${escapeHtml(task.id)}" type="button" title="${task.isFocus ? "Remove focus" : "Set focus"}">
              <i class="fas fa-star"></i>
            </button>
            <button class="task-icon-btn task-delete-btn" data-delete-id="${escapeHtml(task.id)}" type="button" title="Delete task">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>

        <p class="task-note">${highlightText(task.note || "")}</p>

        <div class="task-meta">
          <label class="kanban-done-toggle">
            <input
              type="checkbox"
              data-task-id="${escapeHtml(task.id)}"
              ${isDone ? "checked" : ""}
            />
            <span>${isDone ? "Done" : "Mark done"}</span>
          </label>
          <span class="task-tag task-tag-${priority.toLowerCase()}">${escapeHtml(priority)}</span>
          <span class="meta-pill">${escapeHtml(boardStatus(task))}</span>
          ${task.isFocus ? `<span class="meta-pill">Focus</span>` : ""}
          ${task.dueDate ? `<span class="meta-pill">${new Date(task.dueDate).toLocaleDateString()}</span>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderTasks(tasks) {
  const list = document.querySelector("#tasks-list");
  if (!list) return;

  if (!tasks.length) {
    list.innerHTML = `<div class="${currentView === "kanban" ? "kanban-board" : "task-table-view"}"><p class="task-empty">No matching tasks yet.</p></div>`;
    updateFocusCard();
    updateStats();
    return;
  }

  document.querySelector(".kanban-content-grid")?.classList.toggle("is-table-view", currentView === "table");

  if (currentView === "table") {
    list.innerHTML = `
      <div class="task-table-view">
        ${tasks.map((task) => taskCardMarkup(task, "table")).join("")}
      </div>
    `;
    bindTaskCheckboxes();
    bindDeleteButtons();
    bindFocusButtons();
    updateFocusCard();
    updateStats();
    return;
  }

  const columns = KANBAN_COLUMNS.map((column) => {
    const columnTasks = tasks.filter((task) => boardStatus(task) === column.status);
    const cards = columnTasks
      .map((task) => taskCardMarkup(task, "kanban"))
    .join("");

    return `
      <section class="kanban-column" data-drop-status="${escapeHtml(column.status)}">
        <header class="kanban-column-header">
          <div>
            <span class="kanban-accent kanban-accent-${escapeHtml(column.accent)}"></span>
            <h2>${escapeHtml(column.title)}</h2>
          </div>
          <span class="kanban-count">${columnTasks.length}</span>
        </header>
        <div class="kanban-dropzone" data-drop-status="${escapeHtml(column.status)}">
          ${cards || `<p class="kanban-empty">Drop tasks here</p>`}
        </div>
      </section>
    `;
  }).join("");

  list.innerHTML = `<div class="kanban-board">${columns}</div>`;

  bindTaskCheckboxes();
  bindDeleteButtons();
  bindFocusButtons();
  bindDragAndDrop();
  updateFocusCard();
  updateStats();
}

async function loadTasks() {
  try {
    const data = await apiGet("/api/tasks");
    currentTasks = data.tasks || [];
    renderTasks(getVisibleTasks());
  } catch (err) {
    console.error(err);
    const list = document.querySelector("#tasks-list");
    if (list) list.innerHTML = `<p class="task-empty">${escapeHtml(err.message)}</p>`;
  }
}

function openModal(modal) {
  if (modal) modal.hidden = false;
}

function closeModal(modal) {
  if (modal) modal.hidden = true;
}

function bindNewTaskButton() {
  const button = document.querySelector("#new-task-btn");
  const modal = document.querySelector("#task-modal");
  const form = document.querySelector("#task-form");
  const cancel = document.querySelector("#cancel-task-btn");
  const titleInput = document.querySelector("#task-title-input");
  const noteInput = document.querySelector("#task-note-input");
  const priorityInput = document.querySelector("#task-priority-input");

  if (!button || !modal || !form || !titleInput || !noteInput || !priorityInput) return;

  button.addEventListener("click", () => {
    openModal(modal);
    titleInput.focus();
  });

  cancel?.addEventListener("click", () => {
    closeModal(modal);
    form.reset();
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal(modal);
      form.reset();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await apiPost("/api/tasks", {
        title: titleInput.value.trim(),
        note: noteInput.value.trim(),
        priority: priorityInput.value,
      });

      closeModal(modal);
      form.reset();
      await loadTasks();
    } catch (err) {
      alert(err.message);
    }
  });
}

function bindTaskCheckboxes() {
  document.querySelectorAll("input[data-task-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const taskId = checkbox.dataset.taskId;
      const status = checkbox.checked ? "DONE" : "TODO";

      try {
        await apiPatch(`/api/tasks/${taskId}`, { status });
        await loadTasks();
      } catch (err) {
        alert(err.message);
        checkbox.checked = !checkbox.checked;
      }
    });
  });
}

function bindDragAndDrop() {
  document.querySelectorAll("[data-drag-task-id]").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", card.dataset.dragTaskId);
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("is-dragging");
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      document.querySelectorAll(".kanban-dropzone").forEach((zone) => zone.classList.remove("is-over"));
    });
  });

  document.querySelectorAll(".kanban-dropzone").forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("is-over");
      event.dataTransfer.dropEffect = "move";
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("is-over");
    });

    zone.addEventListener("drop", async (event) => {
      event.preventDefault();
      zone.classList.remove("is-over");
      const id = event.dataTransfer.getData("text/plain");
      const status = zone.dataset.dropStatus;
      const task = currentTasks.find((item) => item.id === id);

      if (!id || !status || boardStatus(task || {}) === status) return;

      try {
        await apiPatch(`/api/tasks/${id}`, { status });
        await loadTasks();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function bindDeleteButtons() {
  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.deleteId;
      if (!confirm("Delete this task?")) return;

      try {
        await apiDelete(`/api/tasks/${id}`);
        await loadTasks();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function bindFocusButtons() {
  document.querySelectorAll("[data-focus-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await setFocusTask(button.dataset.focusId);
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function setFocusTask(id) {
  await apiPatch(`/api/tasks/${id}/focus`, {});
  await loadTasks();
}

function updateFocusCard() {
  const focusCard = document.querySelector(".focus-card");
  if (!focusCard) return;

  const focusTask = currentTasks.find((task) => task.isFocus);
  const title = focusCard.querySelector("h3");
  const text = focusCard.querySelector("p");

  if (!title || !text) return;

  if (!focusTask) {
    title.textContent = "One clear priority.";
    title.classList.remove("focus-card-title");
    text.textContent = "Pick the single task that moves your week forward the most and protect time for it.";
    text.classList.remove("focus-card-note");
    return;
  }

  title.textContent = focusTask.title;
  title.classList.add("focus-card-title");
  text.textContent = focusTask.note || `${focusTask.priority || "MEDIUM"} priority task`;
  text.classList.add("focus-card-note");
}

function updateStats() {
  const total = currentTasks.length;
  const done = currentTasks.filter((task) => task.status === "DONE").length;
  const openTasks = currentTasks.filter((task) => task.status !== "DONE");
  const high = openTasks.filter((task) => task.priority === "HIGH").length;
  const medium = openTasks.filter((task) => task.priority === "MEDIUM").length;
  const low = openTasks.filter((task) => task.priority === "LOW").length;

  const value = document.querySelector(".stats-value");
  if (value) value.textContent = `${done} / ${total} tasks`;

  const fill = document.querySelector(".progress-fill");
  if (fill) fill.style.width = total ? `${Math.round((done / total) * 100)}%` : "0%";

  const list = document.querySelector(".stats-list");
  if (list) {
    list.innerHTML = `
      <li><span class="dot dot-high"></span>High priority · ${high} left</li>
      <li><span class="dot dot-medium"></span>Medium priority · ${medium} left</li>
      <li><span class="dot dot-low"></span>Low priority · ${low} left</li>
    `;
  }
}

function bindFocusModal() {
  const button = document.querySelector("#set-focus-btn");
  const modal = document.querySelector("#focus-modal");
  const options = document.querySelector("#focus-options");
  const cancel = document.querySelector("#cancel-focus-btn");

  if (!button || !modal || !options) return;

  button.addEventListener("click", () => {
    const candidates = sortTasks(currentTasks).filter((task) => task.status !== "DONE");

    if (!candidates.length) {
      options.innerHTML = `<p class="task-empty">No unfinished tasks to focus on.</p>`;
    } else {
      options.innerHTML = candidates
        .map((task) => {
          return `
            <button class="focus-option ${task.isFocus ? "is-current" : ""}" type="button" data-choose-focus="${escapeHtml(task.id)}">
              <strong>${escapeHtml(task.title)}</strong>
              <small>${escapeHtml(task.note || task.priority || "Task")}</small>
            </button>
          `;
        })
        .join("");

      options.querySelectorAll("[data-choose-focus]").forEach((option) => {
        option.addEventListener("click", async () => {
          try {
            await setFocusTask(option.dataset.chooseFocus);
            closeModal(modal);
          } catch (err) {
            alert(err.message);
          }
        });
      });
    }

    openModal(modal);
  });

  cancel?.addEventListener("click", () => closeModal(modal));

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal(modal);
  });
}

function bindSearch() {
  const input = document.querySelector("#task-search");
  if (!input) return;

  input.addEventListener("input", () => {
    currentSearch = input.value;
    renderTasks(getVisibleTasks());
  });
}

function bindFilters() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter || "all";

      document.querySelectorAll("[data-filter]").forEach((chip) => {
        chip.classList.toggle("active", chip === button);
      });

      renderTasks(getVisibleTasks());
    });
  });
}

function bindViewToggle() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      currentView = button.dataset.view || "kanban";
      document.querySelectorAll("[data-view]").forEach((item) => {
        item.classList.toggle("active", item === button);
        item.classList.toggle("muted", item !== button);
      });
      renderTasks(getVisibleTasks());
    });
  });
}

bindNewTaskButton();
bindFocusModal();
bindSearch();
bindFilters();
bindViewToggle();
loadTasks();
