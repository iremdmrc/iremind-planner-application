import { request } from "./study-api.js";

const durations = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
};

let mode = "focus";
let remaining = durations.focus;
let timerId = null;
let completedFocusSeconds = 0;

function render() {
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  document.querySelector("#pomodoro-time").textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function stop() {
  clearInterval(timerId);
  timerId = null;
}

function setMode(nextMode) {
  stop();
  mode = nextMode;
  remaining = durations[mode];
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  render();
}

function start() {
  if (timerId) return;
  timerId = setInterval(() => {
    if (remaining <= 0) {
      stop();
      if (mode === "focus") completedFocusSeconds += durations.focus;
      alert("Round complete.");
      return;
    }
    remaining -= 1;
    render();
  }, 1000);
}

async function saveFocusTime() {
  const elapsedThisRound = mode === "focus" ? durations.focus - remaining : 0;
  const totalSeconds = completedFocusSeconds + elapsedThisRound;
  const minutes = Math.max(1, Math.round(totalSeconds / 60));

  await request("/api/study-sessions", {
    method: "POST",
    body: JSON.stringify({ title: "Pomodoro focus", minutes }),
  });

  completedFocusSeconds = 0;
  alert("Focus time saved.");
}

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.location.href = "dashboard.html";
});
document.querySelector("#pomodoro-start")?.addEventListener("click", start);
document.querySelector("#pomodoro-pause")?.addEventListener("click", stop);
document.querySelector("#pomodoro-reset")?.addEventListener("click", () => setMode(mode));
document.querySelector("#pomodoro-save")?.addEventListener("click", () => {
  saveFocusTime().catch((err) => alert(err.message));
});

render();
