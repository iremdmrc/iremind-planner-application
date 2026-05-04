const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

let nodes = [];
let allNodes = [];
let selectedId = null;
let connectFromId = null;
let dragState = null;
let screens = JSON.parse(localStorage.getItem("iremindMindScreens") || '["Map 1"]');
let activeScreen = localStorage.getItem("iremindActiveMindScreen") || screens[0] || "Map 1";

const shapeDefaults = {
  topic: { w: 168, h: 56, label: "Main Topic" },
  subtopic: { w: 148, h: 48, label: "Subtopic" },
  terminator: { w: 150, h: 64, label: "Start" },
  process: { w: 160, h: 86, label: "Process" },
  decision: { w: 130, h: 130, label: "Decision" },
  document: { w: 150, h: 100, label: "Document" },
  data: { w: 150, h: 82, label: "Data" },
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

function meta(node) {
  try {
    const parsed = JSON.parse(node.note || "{}");
    return {
      shape: parsed.shape || "process",
      text: parsed.text || "",
      screen: parsed.screen || "Map 1",
      x: Number(parsed.x) || 140,
      y: Number(parsed.y) || 140,
      w: Number(parsed.w) || shapeDefaults[parsed.shape || "process"].w,
      h: Number(parsed.h) || shapeDefaults[parsed.shape || "process"].h,
    };
  } catch {
    return { shape: "process", text: node.note || "", screen: "Map 1", x: 140, y: 140, w: 160, h: 86 };
  }
}

function serializeMeta(node, updates = {}) {
  return JSON.stringify({ ...meta(node), screen: activeScreen, ...updates });
}

function selectedNode() {
  return nodes.find((node) => node.id === selectedId);
}

function syncColorControls(color) {
  document.querySelector("#node-color").value = color || "blue";
  document.querySelectorAll("[data-color-choice]").forEach((button) => {
    button.classList.toggle("active", button.dataset.colorChoice === color);
  });
}

function selectNode(id) {
  if (connectFromId && connectFromId !== id) {
    connectNodes(connectFromId, id).catch((err) => alert(err.message));
    connectFromId = null;
    document.querySelector("#connect-node").innerHTML = `<i class="fas fa-link"></i><span>Connect</span>`;
    return;
  }

  selectedId = id;
  const node = selectedNode();
  const details = node ? meta(node) : null;
  document.querySelector("#node-label").value = node?.label || "";
  document.querySelector("#node-note").value = details?.text || "";
  syncColorControls(node?.color || "blue");
  renderCanvas();
}

function renderLines() {
  const svg = document.querySelector("#mind-lines");
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lines = nodes
    .filter((node) => node.parentId && byId.has(node.parentId))
    .map((node) => {
      const parent = byId.get(node.parentId);
      const a = meta(parent);
      const b = meta(node);
      const x1 = a.x + a.w / 2;
      const y1 = a.y + a.h / 2;
      const x2 = b.x + b.w / 2;
      const y2 = b.y + b.h / 2;
      const midX = x1 + (x2 - x1) * 0.55;
      const color = node.color || "blue";
      return `<path class="line-${escapeHtml(color)}" d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}" />`;
    })
    .join("");
  svg.innerHTML = lines;
}

function renderCanvas() {
  const canvas = document.querySelector("#mind-tree");
  if (!nodes.length) {
    canvas.innerHTML = `<div class="manual-empty">Use Topic to start, then add Subtopic branches.</div>`;
    renderLines();
    return;
  }

  canvas.innerHTML = nodes.map((node) => {
    const details = meta(node);
    return `
      <button
        class="manual-node shape-${escapeHtml(details.shape)} node-${escapeHtml(node.color || "green")} ${node.id === selectedId ? "is-selected" : ""}"
        data-node-id="${escapeHtml(node.id)}"
        style="left:${details.x}px;top:${details.y}px;width:${details.w}px;height:${details.h}px"
      >
        <strong>${escapeHtml(node.label)}</strong>
        ${details.text ? `<span>${escapeHtml(details.text)}</span>` : ""}
      </button>
    `;
  }).join("");

  document.querySelectorAll("[data-node-id]").forEach((button) => {
    button.addEventListener("pointerdown", startDrag);
    button.addEventListener("click", () => selectNode(button.dataset.nodeId));
  });
  renderLines();
}

function saveScreens() {
  localStorage.setItem("iremindMindScreens", JSON.stringify(screens));
  localStorage.setItem("iremindActiveMindScreen", activeScreen);
}

function renderScreens() {
  const tabs = document.querySelector("#mind-screen-tabs");
  if (!tabs) return;
  tabs.innerHTML = `
    ${screens.map((screen) => `
      <button class="${screen === activeScreen ? "active" : ""}" data-screen-name="${escapeHtml(screen)}" type="button">${escapeHtml(screen)}</button>
    `).join("")}
    <button class="add-screen-tab" id="add-screen" type="button">+ Screen</button>
  `;
  tabs.querySelectorAll("[data-screen-name]").forEach((button) => {
    button.addEventListener("click", () => {
      activeScreen = button.dataset.screenName;
      selectedId = null;
      saveScreens();
      applyVisibleNodes();
    });
  });
  tabs.querySelector("#add-screen")?.addEventListener("click", () => {
    const next = `Map ${screens.length + 1}`;
    screens.push(next);
    activeScreen = next;
    selectedId = null;
    saveScreens();
    applyVisibleNodes();
  });
}

function applyVisibleNodes() {
  if (!screens.includes(activeScreen)) activeScreen = screens[0] || "Map 1";
  nodes = allNodes.filter((node) => meta(node).screen === activeScreen);
  selectedId = nodes.some((node) => node.id === selectedId) ? selectedId : nodes[0]?.id || null;
  if (selectedId) selectNode(selectedId);
  renderCanvas();
  renderScreens();
}

function canvasPoint(event) {
  const rect = document.querySelector("#mind-tree-card").getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function startDrag(event) {
  const id = event.currentTarget.dataset.nodeId;
  const node = nodes.find((item) => item.id === id);
  const details = meta(node);
  const point = canvasPoint(event);
  dragState = { id, offsetX: point.x - details.x, offsetY: point.y - details.y };
  event.currentTarget.setPointerCapture(event.pointerId);
}

async function finishDrag() {
  if (!dragState) return;
  const node = nodes.find((item) => item.id === dragState.id);
  dragState = null;
  if (!node) return;
  await request(`/api/mind-map/${node.id}`, {
    method: "PATCH",
    body: JSON.stringify({ note: serializeMeta(node) }),
  });
}

function onDrag(event) {
  if (!dragState) return;
  const node = nodes.find((item) => item.id === dragState.id);
  if (!node) return;
  const point = canvasPoint(event);
  const details = meta(node);
  const nextX = Math.max(10, point.x - dragState.offsetX);
  const nextY = Math.max(10, point.y - dragState.offsetY);
  node.note = JSON.stringify({ ...details, x: nextX, y: nextY });
  renderCanvas();
}

async function loadNodes() {
  const data = await request("/api/mind-map");
  allNodes = data.nodes || [];
  applyVisibleNodes();
}

async function addShape(shape) {
  const count = nodes.length + 1;
  const defaults = shapeDefaults[shape] || shapeDefaults.process;
  const parent = shape === "subtopic" ? selectedNode() : null;
  const parentMeta = parent ? meta(parent) : null;
  const side = count % 2 === 0 ? -1 : 1;
  const baseX = parentMeta ? parentMeta.x + side * 260 : 520;
  const baseY = parentMeta ? parentMeta.y + 86 + (count % 5) * 24 : 260;
  const colorByShape = {
    topic: "purple",
    subtopic: "blue",
    terminator: "green",
    process: "blue",
    decision: "gold",
    document: "mint",
    data: "rose",
  };
  const data = await request("/api/mind-map", {
    method: "POST",
    body: JSON.stringify({
      label: defaults.label,
      parentId: parent?.id || null,
      color: colorByShape[shape] || "blue",
      note: JSON.stringify({
        shape,
        text: "",
        screen: activeScreen,
        x: Math.max(40, baseX),
        y: Math.max(80, baseY),
        w: defaults.w,
        h: defaults.h,
      }),
    }),
  });
  selectedId = data.node.id;
  await loadNodes();
}

async function updateNodeColor(color) {
  const node = selectedNode();
  syncColorControls(color);
  if (!node) return;
  node.color = color;
  renderCanvas();
  await request(`/api/mind-map/${node.id}`, {
    method: "PATCH",
    body: JSON.stringify({ color }),
  });
  await loadNodes();
}

async function saveNode() {
  const node = selectedNode();
  if (!node) return;
  const label = document.querySelector("#node-label").value.trim();
  if (!label) {
    alert("Shape text is required.");
    return;
  }
  await request(`/api/mind-map/${node.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      label,
      color: document.querySelector("#node-color").value,
      note: serializeMeta(node, { text: document.querySelector("#node-note").value.trim() }),
    }),
  });
  await loadNodes();
}

async function connectNodes(fromId, toId) {
  await request(`/api/mind-map/${toId}`, {
    method: "PATCH",
    body: JSON.stringify({ parentId: fromId }),
  });
  await loadNodes();
}

async function deleteNode() {
  const node = selectedNode();
  if (!node) return;
  if (!confirm(`Delete "${node.label || "this shape"}"?`)) return;
  await request(`/api/mind-map/${node.id}`, { method: "DELETE" });
  selectedId = null;
  await loadNodes();
}

async function clearScreen() {
  const visible = [...nodes];
  if (!visible.length) return;
  if (!confirm(`Clear everything on "${activeScreen}"?`)) return;
  await Promise.all(visible.map((node) => request(`/api/mind-map/${node.id}`, { method: "DELETE" })));
  selectedId = null;
  await loadNodes();
}

function applyMindTheme(theme) {
  const card = document.querySelector("#mind-tree-card");
  if (!card) return;
  localStorage.setItem("iremindMindTheme", theme);
  card.classList.remove("mind-theme-soft", "mind-theme-flow", "mind-theme-bubble");
  card.classList.add(`mind-theme-${theme}`);
  document.querySelectorAll("[data-mind-theme]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mindTheme === theme);
  });
}

document.querySelectorAll("[data-add-shape]").forEach((button) => {
  button.addEventListener("click", () => addShape(button.dataset.addShape).catch((err) => alert(err.message)));
});
document.querySelector("#save-node")?.addEventListener("click", () => saveNode().catch((err) => alert(err.message)));
document.querySelector("#delete-node")?.addEventListener("click", () => deleteNode().catch((err) => alert(err.message)));
document.querySelector("#clear-screen")?.addEventListener("click", () => clearScreen().catch((err) => alert(err.message)));
document.querySelector("#connect-node")?.addEventListener("click", () => {
  if (!selectedId) return alert("Select a shape first.");
  connectFromId = selectedId;
  document.querySelector("#connect-node").innerHTML = `<i class="fas fa-crosshairs"></i><span>Pick target</span>`;
});
document.querySelectorAll("[data-color-choice]").forEach((button) => {
  button.addEventListener("click", () => updateNodeColor(button.dataset.colorChoice).catch((err) => alert(err.message)));
});
document.querySelectorAll("[data-mind-theme]").forEach((button) => {
  button.addEventListener("click", () => applyMindTheme(button.dataset.mindTheme));
});
document.addEventListener("pointermove", onDrag);
document.addEventListener("pointerup", () => finishDrag().catch((err) => alert(err.message)));

applyMindTheme(localStorage.getItem("iremindMindTheme") || "soft");
if (!screens.includes(activeScreen)) {
  activeScreen = screens[0] || "Map 1";
  saveScreens();
}
loadNodes().catch((err) => alert(err.message));
