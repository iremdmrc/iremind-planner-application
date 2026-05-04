const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const themes = {
  pink: {
    id: "vx5Jl5clrUI",
    start: 120,
  },
  journal: {
    id: "7kN_DF_NJGQ",
    start: 0,
  },
};

function videoUrl(themeName) {
  const theme = themes[themeName] || themes.pink;
  return `https://www.youtube.com/embed/${theme.id}?autoplay=1&mute=0&controls=0&loop=1&playlist=${theme.id}&start=${theme.start}&playsinline=1&rel=0&modestbranding=1`;
}

function formatMinutes(minutes) {
  if (!minutes) return "0 min";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins} min`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function applyTheme(themeName) {
  localStorage.setItem("iremindFocusTheme", themeName);
  document.querySelectorAll(".focus-video-bg").forEach((frame) => {
    frame.src = videoUrl(themeName);
  });
  document.querySelectorAll("[data-focus-theme]").forEach((button) => {
    button.classList.toggle("active", button.dataset.focusTheme === themeName);
  });
}

async function loadHistory() {
  const body = document.querySelector("#focus-history-body");
  if (!body) return;

  try {
    const token = localStorage.getItem("accessToken");
    const res = await fetch(`${API_URL}/api/study-sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");

    const grouped = new Map();
    (data.sessions || []).forEach((session) => {
      const key = dayKey(new Date(session.createdAt));
      const current = grouped.get(key) || { sessions: 0, minutes: 0 };
      current.sessions += 1;
      current.minutes += session.minutes;
      grouped.set(key, current);
    });

    const rows = [...grouped.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 5);

    body.innerHTML = rows.length
      ? rows.map(([date, value]) => `
          <tr>
            <td>${new Date(date).toLocaleDateString([], { month: "short", day: "numeric" })}</td>
            <td>${value.sessions}</td>
            <td>${formatMinutes(value.minutes)}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="3">No saved study sessions yet.</td></tr>`;
  } catch {
    body.innerHTML = `<tr><td colspan="3">Study history could not be loaded.</td></tr>`;
  }
}

document.querySelectorAll("[data-focus-theme]").forEach((button) => {
  button.addEventListener("click", () => applyTheme(button.dataset.focusTheme));
});

document.querySelector("#focus-start-study")?.addEventListener("click", () => {
  document.body.classList.add("focus-started");
});

applyTheme(localStorage.getItem("iremindFocusTheme") || "pink");
loadHistory();
