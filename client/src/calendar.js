const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

let events = [];
let visibleDate = new Date();
let currentView = "month";
let visibilityFilter = "all";
let searchTerm = "";
let selectedDate = new Date();
let pendingDeleteEventId = null;

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
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
    if (res.status === 401) {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      throw new Error("Session expired. Please log in again.");
    }

    throw new Error(data.error || "Request failed");
  }
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

function highlight(value) {
  const safe = escapeHtml(value);
  const term = searchTerm.trim();
  if (!term) return safe;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(`(${escaped})`, "gi"), '<mark class="search-hit">$1</mark>');
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function eventDate(event) {
  return new Date(event.startsAt);
}

function visibleEvents() {
  const term = searchTerm.trim().toLowerCase();

  return events.filter((event) => {
    const visibility = (event.visibility || "PRIVATE").toLowerCase();
    const matchesVisibility = visibilityFilter === "all" || visibility === visibilityFilter;
    const matchesSearch = !term || `${event.title || ""} ${event.note || ""}`.toLowerCase().includes(term);
    return matchesVisibility && matchesSearch;
  });
}

function eventsForDay(date) {
  return visibleEvents()
    .filter((event) => isSameDay(eventDate(event), date))
    .sort((a, b) => eventDate(a) - eventDate(b));
}

function updateDateDisplay() {
  const monthTag = document.querySelector("#date-month-tag");
  const range = document.querySelector("#date-range");
  const year = document.querySelector("#date-year");

  if (currentView === "year") {
    if (monthTag) monthTag.textContent = "YEAR";
    if (range) range.textContent = String(visibleDate.getFullYear());
    if (year) year.textContent = "Year view";
    return;
  }

  const first = startOfMonth(visibleDate);
  const last = endOfMonth(visibleDate);
  if (monthTag) monthTag.textContent = monthNames[visibleDate.getMonth()].slice(0, 3).toUpperCase();
  if (range) range.textContent = `${first.getDate()} - ${last.getDate()}`;
  if (year) year.textContent = `${monthNames[visibleDate.getMonth()]} ${visibleDate.getFullYear()}`;
}

function renderMonth() {
  const grid = document.querySelector(".calendar-grid");
  if (!grid) return;

  const headers = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const first = startOfMonth(visibleDate);
  const mondayIndex = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - mondayIndex);

  const today = new Date();
  let html = headers.map((day) => `<div class="day-header">${day}</div>`).join("");

  for (let i = 0; i < 42; i += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + i);

    const dayEvents = eventsForDay(day);
    const outsideClass = day.getMonth() < visibleDate.getMonth() || day.getFullYear() < visibleDate.getFullYear()
      ? "prev-month"
      : day.getMonth() > visibleDate.getMonth() || day.getFullYear() > visibleDate.getFullYear()
        ? "next-month"
        : "";
    const weekendClass = day.getDay() === 0 || day.getDay() === 6 ? "weekend" : "";
    const todayClass = isSameDay(day, today) ? "today" : "";
    const matchClass = searchTerm && dayEvents.length ? "search-match" : "";

    html += `
      <div class="calendar-day ${outsideClass} ${weekendClass} ${todayClass} ${matchClass}" role="button" tabindex="0" data-date="${toDateInputValue(day)}">
        <div class="day-number">${day.getDate()}</div>
        ${dayEvents.slice(0, 3).map(renderEventPill).join("")}
      </div>
    `;
  }

  grid.classList.remove("calendar-year-grid");
  grid.innerHTML = html;
  bindDayButtons();
  bindEventButtons();
}

function renderYear() {
  const grid = document.querySelector(".calendar-grid");
  if (!grid) return;

  const year = visibleDate.getFullYear();
  grid.classList.add("calendar-year-grid");
  grid.innerHTML = monthNames
    .map((month, index) => {
      const monthEvents = visibleEvents().filter((event) => {
        const date = eventDate(event);
        return date.getFullYear() === year && date.getMonth() === index;
      });

      return `
        <div class="year-month-card" role="button" tabindex="0" data-month="${index}">
          <h3>${month}</h3>
          <span class="year-month-meta">${monthEvents.length} event${monthEvents.length === 1 ? "" : "s"}</span>
          ${monthEvents.length ? monthEvents.slice(0, 4).map(renderEventPill).join("") : "<small>No events</small>"}
        </div>
      `;
    })
    .join("");

  document.querySelectorAll("[data-month]").forEach((button) => {
    button.addEventListener("click", () => {
      visibleDate = new Date(year, Number(button.dataset.month), 1);
      currentView = "month";
      document.querySelector("#view-select").value = "month";
      renderCalendar();
    });
  });

  bindEventButtons();
}

function renderEventPill(event) {
  const date = eventDate(event);
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const color = event.color || "blue";
  return `
    <button class="event ${escapeHtml(color)}" type="button" data-event-id="${escapeHtml(event.id)}" title="Click to delete ${escapeHtml(event.title)}">
      <span class="event-time">${time}</span>${highlight(event.title)}
    </button>
  `;
}

function renderCalendar() {
  updateDateDisplay();
  if (currentView === "year") renderYear();
  else renderMonth();
}

async function loadEvents() {
  const data = await request("/api/events");
  events = data.events || [];
  renderCalendar();
}

function openEventModal(date = new Date()) {
  selectedDate = date;
  const modal = document.querySelector("#event-modal");
  const form = document.querySelector("#event-form");
  const dateInput = document.querySelector("#event-date-input");
  const timeInput = document.querySelector("#event-time-input");

  form?.reset();
  if (dateInput) dateInput.value = toDateInputValue(date);
  if (timeInput) timeInput.value = "09:00";
  if (modal) modal.hidden = false;
  document.querySelector("#event-title-input")?.focus();
}

function closeEventModal() {
  const modal = document.querySelector("#event-modal");
  if (modal) modal.hidden = true;
}

function openDeleteEventModal(calendarEvent) {
  pendingDeleteEventId = calendarEvent.id;
  const modal = document.querySelector("#delete-event-modal");
  const title = document.querySelector("#delete-event-title");

  if (title) title.textContent = `Delete "${calendarEvent.title}"?`;
  if (modal) modal.hidden = false;
}

function closeDeleteEventModal() {
  pendingDeleteEventId = null;
  const modal = document.querySelector("#delete-event-modal");
  if (modal) modal.hidden = true;
}

function setFormError(message = "") {
  const error = document.querySelector("#event-form-error");
  if (!error) return;

  error.textContent = message;
  error.hidden = !message;
}

function showAllEvents() {
  visibilityFilter = "all";
  document.querySelectorAll("[data-visibility-filter]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.visibilityFilter === "all");
  });
}

function clearSearch() {
  searchTerm = "";
  const input = document.querySelector("#event-search");
  if (input) input.value = "";
}

function bindDayButtons() {
  document.querySelectorAll("[data-date]").forEach((button) => {
    button.addEventListener("click", () => {
      openEventModal(new Date(`${button.dataset.date}T09:00:00`));
    });
  });
}

function bindEventButtons() {
  document.querySelectorAll("[data-event-id]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();

      const calendarEvent = events.find((item) => item.id === button.dataset.eventId);
      if (!calendarEvent) return;

      openDeleteEventModal(calendarEvent);
    });
  });
}

function bindControls() {
  document.querySelector("#add-event-btn")?.addEventListener("click", () => openEventModal(selectedDate));

  document.querySelector("#cancel-event-btn")?.addEventListener("click", closeEventModal);
  document.querySelector("#event-modal")?.addEventListener("click", (event) => {
    if (event.target.id === "event-modal") closeEventModal();
  });

  document.querySelector("#cancel-delete-event-btn")?.addEventListener("click", closeDeleteEventModal);
  document.querySelector("#delete-event-modal")?.addEventListener("click", (event) => {
    if (event.target.id === "delete-event-modal") closeDeleteEventModal();
  });
  document.querySelector("#confirm-delete-event-btn")?.addEventListener("click", async () => {
    if (!pendingDeleteEventId) return;

    try {
      await request(`/api/events/${pendingDeleteEventId}`, { method: "DELETE" });
      closeDeleteEventModal();
      await loadEvents();
    } catch (err) {
      alert(err.message || "Event could not be deleted.");
    }
  });

  document.querySelector("#event-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFormError("");

    const date = document.querySelector("#event-date-input").value;
    const time = document.querySelector("#event-time-input").value;
    const startsAt = `${date}T${time}:00`;

    try {
      await request("/api/events", {
        method: "POST",
        body: JSON.stringify({
          title: document.querySelector("#event-title-input").value.trim(),
          note: document.querySelector("#event-note-input").value.trim(),
          startsAt,
          color: document.querySelector("#event-color-input").value,
          visibility: document.querySelector("#event-visibility-input").value,
        }),
      });

      visibleDate = new Date(`${date}T12:00:00`);
      selectedDate = new Date(startsAt);
      currentView = "month";
      document.querySelector("#view-select").value = "month";
      showAllEvents();
      clearSearch();
      closeEventModal();
      await loadEvents();
    } catch (err) {
      console.error(err);
      setFormError(err.message || "Event could not be saved.");
    }
  });

  document.querySelector("#prev-period-btn")?.addEventListener("click", () => {
    visibleDate = new Date(
      visibleDate.getFullYear() - (currentView === "year" ? 1 : 0),
      visibleDate.getMonth() - (currentView === "month" ? 1 : 0),
      1,
    );
    renderCalendar();
  });

  document.querySelector("#next-period-btn")?.addEventListener("click", () => {
    visibleDate = new Date(
      visibleDate.getFullYear() + (currentView === "year" ? 1 : 0),
      visibleDate.getMonth() + (currentView === "month" ? 1 : 0),
      1,
    );
    renderCalendar();
  });

  document.querySelector("#today-btn")?.addEventListener("click", () => {
    visibleDate = new Date();
    selectedDate = new Date();
    renderCalendar();
  });

  document.querySelector("#view-select")?.addEventListener("change", (event) => {
    currentView = event.target.value;
    renderCalendar();
  });

  document.querySelector("#event-search")?.addEventListener("input", (event) => {
    searchTerm = event.target.value;
    renderCalendar();
  });

  document.querySelectorAll("[data-visibility-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      visibilityFilter = button.dataset.visibilityFilter;
      document.querySelectorAll("[data-visibility-filter]").forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });
      renderCalendar();
    });
  });
}

bindControls();
loadEvents().catch((err) => {
  console.error(err);
  alert(err.message);
});
