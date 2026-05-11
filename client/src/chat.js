const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const FALLBACK_AVATAR = "";

const STATUS_LABELS = {
  ONLINE: "Online",
  STUDYING: "Studying",
  IDLE: "Idle",
  DND: "Do not disturb",
  INVISIBLE: "Invisible",
};

let me = null;
let friends = [];
let activeFriend = null;
let messages = [];
let lastMessages = {}; // friendId → last message + time
let searchTerm = "";
let mediaRecorder = null;
let voiceChunks = [];
let callStream = null;

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

function statusLabel(status) {
  return STATUS_LABELS[status] || "Online";
}

function avatarMarkup(user, className = "") {
  const name = user?.displayName || user?.email || "User";
  const initial = name.trim().charAt(0).toUpperCase() || "U";
  if (user?.avatarUrl) return `<img class="${className}" src="${escapeHtml(user.avatarUrl)}" alt="" />`;
  return `<span class="${className} empty-avatar" aria-hidden="true">${escapeHtml(initial)}</span>`;
}

function timeFormat(date) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayDivider(date) {
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const cmp = new Date(d);
  cmp.setHours(0, 0, 0, 0);
  if (cmp.getTime() === today.getTime()) return "Today";
  if (cmp.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function encodeAttachment(kind, fileName, mimeType, dataUrl) {
  return `[[iremind-${kind}:${encodeURIComponent(fileName || kind)}:${encodeURIComponent(mimeType || "")}:${dataUrl}]]`;
}

function parseAttachment(body) {
  const match = String(body || "").match(/^\[\[iremind-(image|file|audio):([^:]*):([^:]*):(data:[\s\S]+)\]\]$/);
  if (!match) return null;
  return {
    kind: match[1],
    fileName: decodeURIComponent(match[2] || match[1]),
    mimeType: decodeURIComponent(match[3] || ""),
    dataUrl: match[4],
  };
}

function previewText(body) {
  const attachment = parseAttachment(body);
  if (!attachment) return body || "";
  if (attachment.kind === "image") return "Image";
  if (attachment.kind === "audio") return "Voice message";
  return attachment.fileName || "Attachment";
}

function renderMessageBody(body) {
  const attachment = parseAttachment(body);
  if (!attachment) return `<p>${escapeHtml(body)}</p>`;
  if (attachment.kind === "image") {
    return `
      <figure class="chat-attachment chat-attachment-image">
        <img src="${escapeHtml(attachment.dataUrl)}" alt="${escapeHtml(attachment.fileName)}" />
        <figcaption>${escapeHtml(attachment.fileName)}</figcaption>
      </figure>`;
  }
  if (attachment.kind === "audio") {
    return `
      <div class="chat-attachment chat-attachment-audio">
        <i class="fas fa-microphone"></i>
        <audio controls src="${escapeHtml(attachment.dataUrl)}"></audio>
      </div>`;
  }
  return `
    <a class="chat-attachment chat-attachment-file" href="${escapeHtml(attachment.dataUrl)}" download="${escapeHtml(attachment.fileName)}">
      <i class="fas fa-file-arrow-down"></i>
      <span>${escapeHtml(attachment.fileName)}</span>
    </a>`;
}

function renderFriends() {
  const list = document.querySelector("#friends-list");
  if (!list) return;

  const filtered = friends.filter((f) =>
    !searchTerm || f.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!filtered.length) {
    list.innerHTML = `<p class="chat-empty-friends">${
      friends.length ? "No matches." : "Add a friend by ID to start chatting."
    }</p>`;
    return;
  }

  list.innerHTML = filtered.map((friend) => {
    const last = lastMessages[friend.id];
    const preview = last?.body ? escapeHtml(previewText(last.body).slice(0, 38)) : "Tap to start chatting";
    const time = last?.createdAt ? timeFormat(last.createdAt) : "";
    return `
      <button class="friend-row status-${escapeHtml(friend.status || "ONLINE")} ${activeFriend?.id === friend.id ? "is-active" : ""}" data-friend-id="${escapeHtml(friend.id)}" type="button">
        <span class="friend-row-avatar">
          ${avatarMarkup(friend)}
          <span class="friend-row-status-dot"></span>
        </span>
        <span class="friend-row-body">
          <span class="friend-row-top">
            <strong>${escapeHtml(friend.displayName)}</strong>
            <small class="friend-row-time">${escapeHtml(time)}</small>
          </span>
          <span class="friend-row-preview">${preview}</span>
        </span>
      </button>
    `;
  }).join("");

  document.querySelectorAll("[data-friend-id]").forEach((button) => {
    button.addEventListener("click", () => selectFriend(button.dataset.friendId));
  });
}

function statusIcon(status) {
  return {
    ONLINE: "fa-check",
    STUDYING: "fa-book-open",
    IDLE: "fa-moon",
    DND: "fa-minus",
    INVISIBLE: "fa-circle",
  }[status] || "fa-check";
}

function renderProfile() {
  const panel = document.querySelector("#profile-panel");
  if (!panel) return;
  if (!activeFriend) {
    panel.innerHTML = `
      <div class="chat-side-header">
        <h2>Details</h2>
        <button class="chat-side-action" type="button" title="More"><i class="fas fa-ellipsis"></i></button>
      </div>
      <p class="profile-empty-note">Click a friend to view their profile.</p>
    `;
    return;
  }
  const status = activeFriend.status || "ONLINE";
  const bannerStyle = activeFriend.bannerUrl
    ? `style="background-image:url('${activeFriend.bannerUrl}')"`
    : "";
  const bannerClass = activeFriend.bannerUrl ? "has-image" : "";
  panel.innerHTML = `
    <div class="chat-side-header">
      <h2>Details</h2>
      <details class="profile-id-menu">
        <summary class="chat-side-action" title="More"><i class="fas fa-ellipsis"></i></summary>
        <button type="button" id="profile-copy-id"><i class="fas fa-copy"></i> Copy user ID</button>
        <small>${escapeHtml(activeFriend.id)}</small>
      </details>
    </div>

    <div class="profile-hero">
      <div class="chat-profile-banner ${bannerClass}" ${bannerStyle}></div>
      <div class="profile-avatar-stack">
        ${avatarMarkup(activeFriend, "chat-profile-avatar")}
        <span class="profile-avatar-status status-${escapeHtml(status)}">
          <i class="fas ${statusIcon(status)}"></i>
        </span>
      </div>
    </div>

    <h3 class="profile-name">${escapeHtml(activeFriend.displayName)}</h3>

    <div class="profile-quick-actions">
      <button type="button" class="profile-quick-btn" data-call-type="video" title="Video call"><i class="fas fa-video"></i></button>
      <button type="button" class="profile-quick-btn" data-call-type="voice" title="Voice call"><i class="fas fa-phone"></i></button>
    </div>

    <details class="profile-section" open>
      <summary>
        <span>BIO Details</span>
        <i class="fas fa-chevron-down"></i>
      </summary>
      <p class="profile-bio">${escapeHtml(activeFriend.about || "No about text yet.")}</p>
    </details>

    <details class="profile-section">
      <summary>
        <span>Status</span>
        <i class="fas fa-chevron-down"></i>
      </summary>
      <span class="status-pill status-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>
    </details>

    <details class="profile-section">
      <summary>
        <span>Setting</span>
        <i class="fas fa-chevron-down"></i>
      </summary>
      <button class="chat-remove-friend" id="remove-friend-btn" type="button">
        <i class="fas fa-user-xmark"></i> Remove friend
      </button>
    </details>
  `;
  document.querySelector("#remove-friend-btn")?.addEventListener("click", removeActiveFriend);
  document.querySelector("#profile-copy-id")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(activeFriend.id);
  });
  bindCallButtons();
}

function renderHeader() {
  const header = document.querySelector("#chat-room-header");
  const input = document.querySelector("#message-input");
  const button = document.querySelector("#send-message-btn");
  if (!header || !input || !button) return;

  if (!activeFriend) {
    header.innerHTML = `
      <div class="chat-room-header-left">
        <div>
          <span class="eyebrow">No conversation</span>
          <h1>Select a friend</h1>
        </div>
      </div>
      <div class="chat-room-header-actions">
        <button type="button" class="chat-icon-btn" disabled><i class="fas fa-video"></i></button>
        <button type="button" class="chat-icon-btn" disabled><i class="fas fa-phone"></i></button>
        <button type="button" class="chat-icon-btn" id="chat-theme-toggle" title="Dark chat"><i class="fas fa-moon"></i></button>
      </div>
    `;
    input.disabled = true;
    button.disabled = true;
    input.placeholder = "Pick a friend to send messages";
    return;
  }

  const status = activeFriend.status || "ONLINE";
  header.innerHTML = `
    <div class="chat-room-header-left">
      <div class="chat-room-avatar-wrap">
        ${avatarMarkup(activeFriend)}
        <span class="friend-row-status-dot ${`status-${escapeHtml(status)}`}"></span>
      </div>
      <div>
        <h1>${escapeHtml(activeFriend.displayName)}</h1>
        <span class="chat-room-header-status">
          <span class="status-dot status-${escapeHtml(status)}"></span>
          ${escapeHtml(statusLabel(status))}
        </span>
      </div>
    </div>
    <div class="chat-room-header-actions">
      <button type="button" class="chat-icon-btn" data-call-type="video" title="Video call"><i class="fas fa-video"></i></button>
      <button type="button" class="chat-icon-btn" data-call-type="voice" title="Voice call"><i class="fas fa-phone"></i></button>
      <button type="button" class="chat-icon-btn" id="chat-theme-toggle" title="Dark chat"><i class="fas fa-moon"></i></button>
    </div>
  `;
  input.disabled = false;
  button.disabled = false;
  input.placeholder = `Write a message`;
  bindCallButtons();
  bindChatThemeToggle();
}

function renderMessages() {
  const list = document.querySelector("#messages-list");
  if (!list) return;

  if (!activeFriend) {
    list.innerHTML = `
      <div class="chat-empty">
        <div>
          <div class="chat-empty-icon"><i class="fas fa-comments"></i></div>
          <div class="chat-empty-title">No conversation yet</div>
          <div class="chat-empty-sub">Pick a friend on the left to start chatting.</div>
        </div>
      </div>`;
    return;
  }
  if (!messages.length) {
    list.innerHTML = `
      <div class="chat-empty">
        <div>
          <div class="chat-empty-icon"><i class="fas fa-paper-plane"></i></div>
          <div class="chat-empty-title">Say hi to ${escapeHtml(activeFriend.displayName)}</div>
          <div class="chat-empty-sub">This is the beginning of your conversation.</div>
        </div>
      </div>`;
    return;
  }

  let html = "";
  let lastDay = "";
  messages.forEach((message) => {
    const dayLabel = dayDivider(message.createdAt);
    if (dayLabel !== lastDay) {
      html += `<div class="chat-day-divider"><span>${escapeHtml(dayLabel)}</span></div>`;
      lastDay = dayLabel;
    }
    const messageSenderId = message.senderId || message.sender?.id || message.sender?.userId;
    const isMe = String(messageSenderId) === String(me.id);
    const tick = isMe
      ? `<span class="msg-tick ${message.readAt ? "is-read" : ""}"><i class="fas fa-check-double"></i></span>`
      : "";
    const avatar = !isMe
      ? avatarMarkup(activeFriend, "message-avatar")
      : "";
    html += `
      <div class="message-row ${isMe ? "is-me" : ""}">
        ${avatar}
        <div class="message-cluster">
          <div class="message-bubble">
            ${renderMessageBody(message.body)}
          </div>
          <small class="message-stamp">
            ${timeFormat(message.createdAt)}
            ${tick}
          </small>
        </div>
      </div>
    `;
  });
  list.innerHTML = html;
  list.scrollTop = list.scrollHeight;
}

async function loadFriends() {
  const data = await request("/api/chat/friends");
  friends = data.friends || [];
  renderFriends();
}

async function selectFriend(id) {
  activeFriend = friends.find((friend) => friend.id === id);
  renderFriends();
  renderHeader();
  renderProfile();
  const data = await request(`/api/chat/messages/${id}`);
  messages = data.messages || [];
  // cache last message preview
  if (messages.length) {
    lastMessages[id] = messages[messages.length - 1];
  }
  renderMessages();
  renderFriends();
}

async function addFriend(event) {
  event.preventDefault();
  const input = document.querySelector("#friend-id-input");
  const friendId = input.value.trim();
  if (!friendId) return;
  const data = await request("/api/chat/friends", {
    method: "POST",
    body: JSON.stringify({ friendId }),
  });
  input.value = "";
  await loadFriends();
  await selectFriend(data.friend.id);
}

async function removeActiveFriend() {
  if (!activeFriend) return;
  await request(`/api/chat/friends/${activeFriend.id}`, { method: "DELETE" });
  activeFriend = null;
  messages = [];
  await loadFriends();
  renderHeader();
  renderProfile();
  renderMessages();
}

async function sendMessage(event) {
  event.preventDefault();
  const input = document.querySelector("#message-input");
  const body = input.value.trim();
  if (!activeFriend || !body) return;
  input.value = "";
  const data = await request("/api/chat/messages", {
    method: "POST",
    body: JSON.stringify({ receiverId: activeFriend.id, body }),
  });
  if (data.message && !messages.some((item) => item.id === data.message.id)) {
    messages.push(data.message);
    lastMessages[activeFriend.id] = data.message;
    renderMessages();
    renderFriends();
  }
}

async function sendAttachment(kind, file) {
  if (!activeFriend || !file) return;
  if (file.size > 1_900_000) {
    alert("Please choose a file smaller than 2 MB.");
    return;
  }
  const dataUrl = await fileToDataUrl(file);
  const body = encodeAttachment(kind, file.name, file.type, dataUrl);
  const data = await request("/api/chat/messages", {
    method: "POST",
    body: JSON.stringify({ receiverId: activeFriend.id, body }),
  });
  if (data.message && !messages.some((item) => item.id === data.message.id)) {
    messages.push(data.message);
    lastMessages[activeFriend.id] = data.message;
    renderMessages();
    renderFriends();
  }
}

async function toggleVoiceMessage() {
  const button = document.querySelector("#voice-message-btn");
  if (!activeFriend) return;
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    button?.classList.remove("is-recording");
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  voiceChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size) voiceChunks.push(event.data);
  };
  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(voiceChunks, { type: "audio/webm" });
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
    await sendAttachment("audio", file);
  };
  mediaRecorder.start();
  button?.classList.add("is-recording");
}

async function startCall(type) {
  if (!activeFriend) return;
  const modal = document.querySelector("#chat-call-modal");
  const video = document.querySelector("#chat-call-video");
  const title = document.querySelector("#chat-call-title");
  const label = document.querySelector("#chat-call-label");
  const note = document.querySelector("#chat-call-note");
  callStream = await navigator.mediaDevices.getUserMedia({ video: type === "video", audio: true });
  if (video) {
    video.srcObject = callStream;
    video.hidden = type !== "video";
  }
  if (label) label.textContent = type === "video" ? "Video call" : "Voice call";
  if (title) title.textContent = activeFriend.displayName;
  if (note) {
    note.textContent = type === "video"
      ? "Camera and microphone are active in this call preview."
      : "Microphone is active in this voice call preview.";
  }
  if (modal) modal.hidden = false;
}

function endCall() {
  callStream?.getTracks().forEach((track) => track.stop());
  callStream = null;
  const modal = document.querySelector("#chat-call-modal");
  const video = document.querySelector("#chat-call-video");
  if (video) video.srcObject = null;
  if (modal) modal.hidden = true;
}

function bindCallButtons() {
  document.querySelectorAll("[data-call-type]").forEach((button) => {
    if (button.dataset.boundCall) return;
    button.dataset.boundCall = "true";
    button.addEventListener("click", () => {
      startCall(button.dataset.callType).catch((err) => alert(err.message));
    });
  });
}

function bindChatThemeToggle() {
  document.querySelectorAll("#chat-theme-toggle").forEach((button) => {
    if (button.dataset.boundTheme) return;
    button.dataset.boundTheme = "true";
    button.addEventListener("click", () => {
      document.body.classList.toggle("chat-dark-mode");
      localStorage.setItem("chatDarkMode", document.body.classList.contains("chat-dark-mode") ? "1" : "0");
    });
  });
}

function openStream() {
  const source = new EventSource(`${API_URL}/api/chat/stream?token=${encodeURIComponent(token())}`);
  source.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type !== "message") return;
    const message = payload.message;
    if (activeFriend && [message.senderId, message.receiverId].includes(activeFriend.id)) {
      if (!messages.some((item) => item.id === message.id)) messages.push(message);
      renderMessages();
    }
    // update preview for whichever friend is involved
    const friendId = message.senderId === me.id ? message.receiverId : message.senderId;
    lastMessages[friendId] = message;
    renderFriends();
  };
}

async function init() {
  const data = await request("/api/chat/me");
  me = data.user;
  document.querySelector("#my-chat-id").textContent = me.id;
  if (localStorage.getItem("chatDarkMode") === "1") document.body.classList.add("chat-dark-mode");
  await loadFriends();
  renderHeader();
  renderMessages();
  renderProfile();
  openStream();
  bindChatThemeToggle();
  bindCallButtons();
}

document.querySelector("#add-friend-form")?.addEventListener("submit", (event) => {
  addFriend(event).catch((err) => alert(err.message));
});
document.querySelector("#message-form")?.addEventListener("submit", (event) => {
  sendMessage(event).catch((err) => alert(err.message));
});
document.querySelector("#friends-search")?.addEventListener("input", (event) => {
  searchTerm = event.target.value;
  renderFriends();
});
document.querySelector("#attach-image-btn")?.addEventListener("click", () => {
  document.querySelector("#chat-image-input")?.click();
});
document.querySelector("#attach-file-btn")?.addEventListener("click", () => {
  document.querySelector("#chat-file-input")?.click();
});
document.querySelector("#chat-image-input")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  sendAttachment("image", file).catch((err) => alert(err.message));
  event.target.value = "";
});
document.querySelector("#chat-file-input")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  sendAttachment("file", file).catch((err) => alert(err.message));
  event.target.value = "";
});
document.querySelector("#voice-message-btn")?.addEventListener("click", () => {
  toggleVoiceMessage().catch((err) => alert(err.message));
});
document.querySelector("#chat-call-close")?.addEventListener("click", endCall);
document.querySelector("#chat-call-end")?.addEventListener("click", endCall);

init().catch((err) => alert(err.message));
