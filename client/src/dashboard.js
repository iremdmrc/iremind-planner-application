const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
let learningSessions = [];
let learningRange = "daily";

function token() {
  const value = localStorage.getItem("accessToken");
  if (!value) window.location.href = "/index.html";
  return value;
}

async function request(path) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token()}` },
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

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function formatMinutes(minutes) {
  if (!minutes) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function statusClass(status) {
  if (status === "DONE") return "status-done";
  if (status === "WORKING") return "status-working";
  if (status === "STUCK") return "status-stuck";
  return "status-todo";
}

function progressForTask(task) {
  if (task.status === "DONE") return 100;
  if (task.status === "WORKING") return 55;
  if (task.status === "STUCK") return 15;
  return task.isFocus ? 35 : 8;
}

function renderTasks(tasks, user) {
  const container = document.querySelector("#task-list-container");
  const latest = [...tasks]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);
  const initial = (user?.displayName || user?.email || "U").trim()[0]?.toUpperCase() || "U";

  if (!latest.length) {
    container.innerHTML = `
      <div class="task-row highlighted">
        <div class="text-gray-800 font-semibold">No tasks yet</div>
        <div class="owner-group"><span class="owner-icon">${initial}</span></div>
        <div class="progress-bar-container"><div class="progress-bar" style="width:0%"></div></div>
        <div class="flex justify-center"><span class="status-tag status-todo">To Do</span></div>
        <div class="text-right text-sm text-gray-500">Today</div>
      </div>
      <button id="add-new-task-btn" class="btn-new-task">+ NEW TASK</button>
    `;
  } else {
    container.innerHTML = latest.map((task) => {
      const progress = progressForTask(task);
      const date = task.dueDate
        ? new Date(task.dueDate).toLocaleDateString([], { month: "short", day: "numeric" })
        : new Date(task.createdAt).toLocaleDateString([], { month: "short", day: "numeric" });
      return `
        <div class="task-row highlighted" data-open-todo>
          <div class="text-gray-800 font-semibold">
            ${escapeHtml(task.title)}
            <span class="text-xs text-gray-400 ml-2">(${escapeHtml(task.priority || "MEDIUM")})</span>
          </div>
          <div class="owner-group"><span class="owner-icon">${escapeHtml(initial)}</span></div>
          <div class="progress-bar-container"><div class="progress-bar" style="width:${progress}%;"></div></div>
          <div class="flex justify-center"><span class="status-tag ${statusClass(task.status)}">${escapeHtml(task.status || "TODO")}</span></div>
          <div class="text-right text-sm text-gray-500">${escapeHtml(date)}</div>
        </div>
      `;
    }).join("") + `<button id="add-new-task-btn" class="btn-new-task">+ NEW TASK</button>`;
  }

  document.querySelector("#add-new-task-btn")?.addEventListener("click", () => {
    window.location.href = "todo.html";
  });
  document.querySelectorAll("[data-open-todo]").forEach((row) => {
    row.addEventListener("click", () => {
      window.location.href = "todo.html";
    });
  });
}

function renderEvents(events) {
  const list = document.querySelector(".events-list");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setDate(now.getDate() + 7);

  const upcoming = events
    .filter((event) => {
      const date = new Date(event.startsAt);
      return date >= now && date <= end;
    })
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
    .slice(0, 5);

  if (!upcoming.length) {
    list.innerHTML = `<li class="event-item"><div class="event-content"><div class="event-title">No upcoming events</div><div class="event-meta">Add one from Calendar.</div></div></li>`;
    return;
  }

  list.innerHTML = upcoming.map((event) => {
    const date = new Date(event.startsAt);
    return `
      <li class="event-item" data-open-calendar>
        <div class="event-date pretty-date">
          <span class="event-day">${date.getDate()}</span>
          <span class="event-month">${date.toLocaleDateString([], { month: "short" }).toUpperCase()}</span>
        </div>
        <div class="event-content">
          <div class="event-title">${escapeHtml(event.title)}</div>
          <div class="event-meta">${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${event.note ? ` · ${escapeHtml(event.note)}` : ""}</div>
        </div>
      </li>
    `;
  }).join("");

  document.querySelectorAll("[data-open-calendar]").forEach((item) => {
    item.addEventListener("click", () => {
      window.location.href = "calendar.html";
    });
  });
}

function lastDays(count) {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = count - 1; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    days.push(day);
  }
  return days;
}

function startOfWeek(date) {
  const start = new Date(date);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function learningBuckets(range) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (range === "weekly") {
    return Array.from({ length: 8 }, (_, index) => {
      const start = startOfWeek(today);
      start.setDate(start.getDate() - (7 - index - 1) * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return { start, end, label: `${start.toLocaleDateString([], { month: "short", day: "numeric" })}` };
    });
  }

  if (range === "monthly") {
    return Array.from({ length: 6 }, (_, index) => {
      const start = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return { start, end, label: start.toLocaleDateString([], { month: "short" }) };
    });
  }

  return lastDays(7).map((day) => {
    const end = new Date(day);
    end.setDate(day.getDate() + 1);
    return { start: day, end, label: day.toLocaleDateString([], { month: "short", day: "numeric" }) };
  });
}

function rangeTitle(range) {
  if (range === "weekly") return "Weekly";
  if (range === "monthly") return "Monthly";
  return "Daily";
}

function renderLearningChart(sessions, range = learningRange) {
  const bars = document.querySelector(".chart-bars");
  const axis = document.querySelector(".chart-y-axis");
  const labelNode = document.querySelector("#learning-range-label");
  const buckets = learningBuckets(range);
  const totals = buckets.map((bucket) => {
    return sessions
      .filter((session) => {
        const date = new Date(session.createdAt);
        return date >= bucket.start && date < bucket.end;
      })
      .reduce((sum, session) => sum + session.minutes, 0);
  });
  const max = Math.max(30, ...totals);
  const totalMinutes = totals.reduce((sum, value) => sum + value, 0);

  if (labelNode) labelNode.textContent = `${rangeTitle(range)} ▾`;
  if (axis) {
    axis.innerHTML = [max, Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0]
      .map((value) => `<span>${formatMinutes(value)}</span>`)
      .join("");
  }

  bars.innerHTML = buckets.map((bucket, index) => {
    const total = totals[index];
    const height = Math.max(4, Math.round((total / max) * 160));
    return `
      <div class="day-column">
        <span class="bar-total">${formatMinutes(total)}</span>
        <div class="day-bar" title="${formatMinutes(total)} total study time">
          <div class="bar-segment bar-live" style="height:${height}px"></div>
        </div>
        <span class="day-label">${escapeHtml(bucket.label)}</span>
      </div>
    `;
  }).join("");

  document.querySelector(".learning-subtitle").textContent = `${formatMinutes(totalMinutes)} total · ${rangeTitle(range).toLowerCase()} view`;
}

function bindLearningRange() {
  document.querySelectorAll("[data-learning-range]").forEach((button) => {
    button.addEventListener("click", () => {
      learningRange = button.dataset.learningRange || "daily";
      document.querySelector("#range-toggle").checked = false;
      renderLearningChart(learningSessions, learningRange);
    });
  });
}

async function initDashboard() {
  const [me, tasksData, eventsData, sessionsData] = await Promise.all([
    request("/api/me"),
    request("/api/tasks"),
    request("/api/events"),
    request("/api/study-sessions"),
  ]);

  renderTasks(tasksData.tasks || [], me.user);
  renderEvents(eventsData.events || []);
  learningSessions = sessionsData.sessions || [];
  bindLearningRange();
  renderLearningChart(learningSessions, learningRange);
}

initDashboard().catch((err) => console.warn(err.message));
