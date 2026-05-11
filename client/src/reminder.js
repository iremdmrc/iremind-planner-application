const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

let reminders = [];
let currentFilter = "all";

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

function relativeTime(value) {
  const due = new Date(value).getTime();
  const now = Date.now();
  const diff = due - now;
  const absMinutes = Math.round(Math.abs(diff) / 60000);
  const absHours = Math.round(absMinutes / 60);
  if (diff < 0) {
    if (absMinutes < 60) return `${absMinutes} min ago`;
    if (absHours < 24) return `${absHours}h ago`;
    return `${Math.round(absHours / 24)}d ago`;
  }
  if (absMinutes < 1) return "Now";
  if (absMinutes < 60) return `In ${absMinutes} min`;
  if (absHours < 24) return `In ${absHours}h`;
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function exactTime(value) {
  return new Date(value).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function urgencyLevel(item) {
  if (item.completed) return "calm";
  const diff = new Date(item.dueAt).getTime() - Date.now();
  const minutes = diff / 60000;
  if (minutes < 0) return "overdue";
  if (minutes <= 60) return "soon";
  if (minutes <= 6 * 60) return "today";
  return "calm";
}

function urgencyLabel(level) {
  return {
    overdue: "Overdue",
    soon: "Due soon",
    today: "Today",
    calm: "Upcoming",
  }[level] || "Upcoming";
}

function updateCounts() {
  const counts = {
    all: 0,
    EVENT: 0,
    TASK: 0,
    DONE: 0,
  };
  reminders.forEach((item) => {
    if (item.completed) {
      counts.DONE += 1;
    } else {
      counts.all += 1;
      counts[item.sourceType] = (counts[item.sourceType] || 0) + 1;
    }
  });
  document.querySelector("#count-all").textContent = counts.all;
  document.querySelector("#count-event").textContent = counts.EVENT || 0;
  document.querySelector("#count-task").textContent = counts.TASK || 0;
  document.querySelector("#count-done").textContent = counts.DONE;

  const summary = document.querySelector("#notif-summary");
  if (summary) {
    if (counts.all === 0 && counts.DONE === 0) {
      summary.textContent = "You're all caught up. Nothing pending in the next 24 hours.";
    } else if (counts.all === 0) {
      summary.textContent = "Inbox empty. Nice work staying on top of things.";
    } else {
      summary.textContent = `${counts.all} pending · ${counts.EVENT || 0} events · ${counts.TASK || 0} tasks`;
    }
  }
}

function filteredReminders() {
  if (currentFilter === "all") return reminders.filter((item) => !item.completed);
  if (currentFilter === "DONE") return reminders.filter((item) => item.completed);
  return reminders.filter((item) => !item.completed && item.sourceType === currentFilter);
}

function render() {
  const list = document.querySelector("#reminder-list");
  if (!list) return;

  const items = filteredReminders();

  if (!items.length) {
    list.innerHTML = `
      <div class="notif-empty">
        <div class="notif-empty-icon"><i class="fas fa-bell-slash"></i></div>
        <h2>Nothing to show here</h2>
        <p>${currentFilter === "DONE"
          ? "Complete a reminder and it will appear here."
          : "When events or tasks come due, they show up here in real time."}</p>
      </div>
    `;
    return;
  }

  list.innerHTML = items.map((item) => {
    const level = urgencyLevel(item);
    const isEvent = item.sourceType === "EVENT";
    const icon = item.completed
      ? "fa-check"
      : isEvent ? "fa-calendar-day" : "fa-list-check";
    return `
      <article class="notif-card urgency-${level} ${item.completed ? "is-complete" : ""}" data-id="${escapeHtml(item.id)}">
        <div class="notif-card-rail"></div>
        <div class="notif-card-icon">
          <i class="fas ${icon}"></i>
        </div>
        <div class="notif-card-body">
          <div class="notif-card-meta">
            <span class="notif-chip ${isEvent ? "is-event" : "is-task"}">
              <i class="fas ${isEvent ? "fa-calendar" : "fa-circle-check"}"></i>
              ${escapeHtml(item.kind)}
            </span>
            <span class="notif-chip is-time">
              <i class="far fa-clock"></i>
              ${relativeTime(item.dueAt)}
            </span>
            <span class="notif-chip urgency-pill">${urgencyLabel(level)}</span>
          </div>
          <h2>${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(item.note || "Reminder will notify you one day before.")}</p>
          <small class="notif-card-stamp">${exactTime(item.dueAt)}</small>
        </div>
        <div class="notif-card-actions">
          <button class="notif-action-btn ${item.completed ? "is-done" : ""}"
            data-complete-reminder="${escapeHtml(item.sourceType)}:${escapeHtml(item.sourceId)}"
            ${item.completed ? "disabled" : ""}>
            <i class="fas ${item.completed ? "fa-check-double" : "fa-check"}"></i>
            ${item.completed ? "Cleared" : "Mark done"}
          </button>
        </div>
      </article>
    `;
  }).join("");

  document.querySelectorAll("[data-complete-reminder]").forEach((button) => {
    button.addEventListener("click", async () => {
      const [sourceType, sourceId] = button.dataset.completeReminder.split(":");
      button.classList.add("is-loading");
      try {
        await request("/api/reminders/complete", {
          method: "POST",
          body: JSON.stringify({ sourceType, sourceId }),
        });
        await loadReminders();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function loadReminders() {
  try {
    const data = await request("/api/reminders");
    reminders = data.reminders || [];
    updateCounts();
    render();
  } catch (err) {
    const list = document.querySelector("#reminder-list");
    if (list) {
      list.innerHTML = `<div class="notif-empty"><h2>Couldn't load reminders</h2><p>${escapeHtml(err.message)}</p></div>`;
    }
  }
}

function bindTabs() {
  document.querySelectorAll(".notif-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".notif-tab").forEach((node) => node.classList.remove("is-active"));
      tab.classList.add("is-active");
      currentFilter = tab.dataset.filter;
      render();
    });
  });
}

bindTabs();
loadReminders();
// Light polling so newly due reminders appear without a refresh
setInterval(loadReminders, 60_000);
