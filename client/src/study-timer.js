import { formatHMS, request } from "./study-api.js";

let timers = [
  { id: crypto.randomUUID(), title: "Study session", seconds: 0, timerId: null },
];
let activeTimerId = timers[0].id;
let sessions = [];

function activeTimer() {
  return timers.find((timer) => timer.id === activeTimerId) || timers[0];
}

function stopTimer(timer) {
  if (!timer?.timerId) return;
  clearInterval(timer.timerId);
  timer.timerId = null;
}

function persistTimers() {
  localStorage.setItem(
    "iremindStudyTimers",
    JSON.stringify(timers.map(({ id, title, seconds }) => ({ id, title, seconds })))
  );
}

function loadSavedTimers() {
  try {
    const saved = JSON.parse(localStorage.getItem("iremindStudyTimers") || "[]");
    if (Array.isArray(saved) && saved.length) {
      timers = saved.map((timer) => ({
        id: timer.id || crypto.randomUUID(),
        title: timer.title || "Study session",
        seconds: Number(timer.seconds) || 0,
        timerId: null,
      }));
      activeTimerId = timers[0].id;
    }
  } catch {
    localStorage.removeItem("iremindStudyTimers");
  }
}

function renderTimerTabs() {
  const tabs = document.querySelector("#timer-tabs");
  tabs.innerHTML = timers.map((timer, index) => `
    <button class="${timer.id === activeTimerId ? "active" : ""}" data-timer-id="${timer.id}">
      ${timer.title || `Timer ${index + 1}`}
      <span>${formatHMS(timer.seconds)}</span>
    </button>
  `).join("");

  tabs.querySelectorAll("[data-timer-id]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTimerId = button.dataset.timerId;
      renderTimer();
      renderTimerTabs();
    });
  });
}

function renderTimer() {
  const timer = activeTimer();
  document.querySelector("#timer-display").textContent = formatHMS(timer.seconds);
  document.querySelector("#session-title").value = timer.title;
  document.querySelector("#timer-start").textContent = timer.timerId ? "running" : "start";
  renderTimerTabs();
}

function start() {
  const timer = activeTimer();
  if (timer.timerId) return;
  timer.timerId = setInterval(() => {
    timer.seconds += 1;
    persistTimers();
    renderTimer();
  }, 1000);
  renderTimer();
}

function pause() {
  stopTimer(activeTimer());
  persistTimers();
  renderTimer();
}

function reset() {
  const timer = activeTimer();
  stopTimer(timer);
  timer.seconds = 0;
  persistTimers();
  renderTimer();
}

function addTimer() {
  const nextNumber = timers.length + 1;
  const timer = {
    id: crypto.randomUUID(),
    title: `Study timer ${nextNumber}`,
    seconds: 0,
    timerId: null,
  };
  timers.push(timer);
  activeTimerId = timer.id;
  persistTimers();
  renderTimer();
}

function deleteTimer() {
  if (timers.length <= 1) {
    alert("You need at least one timer.");
    return;
  }

  const timer = activeTimer();
  if (!confirm(`Delete "${timer.title || "this timer"}"?`)) return;
  stopTimer(timer);
  timers = timers.filter((item) => item.id !== timer.id);
  activeTimerId = timers[0].id;
  persistTimers();
  renderTimer();
}

function updateTitle() {
  const timer = activeTimer();
  timer.title = document.querySelector("#session-title").value.trim() || "Study session";
  persistTimers();
  renderTimerTabs();
}

async function save() {
  const timer = activeTimer();
  const minutes = Math.max(1, Math.round(timer.seconds / 60));
  const title = timer.title || "Study session";

  await request("/api/study-sessions", {
    method: "POST",
    body: JSON.stringify({ title, minutes }),
  });

  timer.seconds = 0;
  stopTimer(timer);
  persistTimers();
  renderTimer();
  await loadSessions();
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function lastSevenDays() {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    days.push(day);
  }
  return days;
}

function renderStats() {
  if (!document.querySelector("#total-minutes")) return;
  const total = sessions.reduce((sum, session) => sum + session.minutes, 0);
  const byDay = new Map();
  sessions.forEach((session) => {
    const key = dayKey(new Date(session.createdAt));
    byDay.set(key, (byDay.get(key) || 0) + session.minutes);
  });
  const best = Math.max(0, ...byDay.values());

  document.querySelector("#total-minutes").textContent = total;
  document.querySelector("#session-count").textContent = sessions.length;
  document.querySelector("#best-day").textContent = best;
}

function renderChart() {
  const chart = document.querySelector("#study-chart");
  if (!chart) return;
  const days = lastSevenDays();
  const totals = days.map((day) => {
    const key = dayKey(day);
    return sessions
      .filter((session) => dayKey(new Date(session.createdAt)) === key)
      .reduce((sum, session) => sum + session.minutes, 0);
  });
  const max = Math.max(30, ...totals);

  chart.innerHTML = days.map((day, index) => {
    const value = totals[index];
    const height = Math.max(8, Math.round((value / max) * 92));
    const label = day.toLocaleDateString([], { weekday: "short" });
    return `<div class="bar" style="height:${height}px" title="${value} minutes"><span>${label}</span></div>`;
  }).join("");
}

async function loadSessions() {
  const data = await request("/api/study-sessions");
  sessions = data.sessions || [];
  renderStats();
  renderChart();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.location.href = "dashboard.html";
});
document.querySelector("#session-title")?.addEventListener("input", updateTitle);
document.querySelector("#timer-start")?.addEventListener("click", start);
document.querySelector("#timer-pause")?.addEventListener("click", pause);
document.querySelector("#timer-reset")?.addEventListener("click", reset);
document.querySelector("#timer-add")?.addEventListener("click", addTimer);
document.querySelector("#timer-delete")?.addEventListener("click", deleteTimer);
document.querySelector("#timer-save")?.addEventListener("click", () => {
  save().catch((err) => alert(err.message));
});

loadSavedTimers();
renderTimer();
loadSessions().catch((err) => alert(err.message));
