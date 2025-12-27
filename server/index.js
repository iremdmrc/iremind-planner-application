import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();

// ---- Config
const JWT_SECRET = process.env.JWT_SECRET || "change-this";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
const PORT = process.env.PORT || 5000;

// ---- Middlewares
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

// ---- JWT helpers
function signTokens(user) {
  const accessToken = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "15m" });
  const refreshToken = jwt.sign({ sub: user.id, type: "refresh" }, JWT_SECRET, { expiresIn: "7d" });
  return { accessToken, refreshToken };
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ---- Root & Health
app.get("/", (_req, res) => res.redirect("/health"));
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---- Auth
app.post("/auth/register", async (req, res) => {
  try {
    const { email, password, display_name } = req.body;
    if (!email || !password || !display_name) return res.status(400).json({ error: "missing fields" });

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ error: "email in use" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName: display_name },
      select: { id: true, email: true, displayName: true },
    });

    await prisma.notebook.create({ data: { userId: user.id, title: "My Notebook" } });

    const tokens = signTokens(user);
    res.status(201).json({ user, ...tokens });
  } catch (e) {
    console.error("register error:", e);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    const user = { id: u.id, email: u.email, displayName: u.displayName };
    const tokens = signTokens(user);
    res.json({ user, ...tokens });
  } catch (e) {
    console.error("login error:", e);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/auth/refresh", async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: "no token" });
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== "refresh") return res.status(401).json({ error: "invalid refresh" });

    const userDb = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, displayName: true },
    });
    if (!userDb) return res.status(401).json({ error: "user not found" });

    const tokens = signTokens(userDb);
    res.json(tokens);
  } catch (e) {
    console.error("refresh error:", e);
    res.status(401).json({ error: "invalid token" });
  }
});

// ---- Notebooks
app.get("/notebooks", auth, async (req, res) => {
  const books = await prisma.notebook.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "asc" },
  });
  res.json(books);
});

app.post("/notebooks", auth, async (req, res) => {
  const { title } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "title required" });
  const nb = await prisma.notebook.create({ data: { title, userId: req.user.id } });
  res.status(201).json(nb);
});

// ---- Notes
app.get("/notes", auth, async (req, res) => {
  const { notebookId } = req.query;
  const notes = await prisma.note.findMany({
    where: { userId: req.user.id, ...(notebookId ? { notebookId: String(notebookId) } : {}) },
    orderBy: { createdAt: "desc" },
  });
  res.json(notes);
});

app.post("/notes", auth, async (req, res) => {
  const { notebookId, content } = req.body;
  if (!notebookId || !content?.trim()) return res.status(400).json({ error: "missing fields" });

  const nb = await prisma.notebook.findFirst({ where: { id: notebookId, userId: req.user.id } });
  if (!nb) return res.status(403).json({ error: "notebook not found" });

  const note = await prisma.note.create({ data: { notebookId, userId: req.user.id, content } });
  res.status(201).json(note);
});

app.patch("/notes/:id", auth, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  const note = await prisma.note.findFirst({ where: { id, userId: req.user.id } });
  if (!note) return res.status(404).json({ error: "note not found" });

  const updated = await prisma.note.update({ where: { id }, data: { content } });
  res.json(updated);
});

// ---- Tasks (Study Planner)
app.get("/tasks", auth, async (req, res) => {
  const upcoming = Number(req.query.upcoming || 0);
  const where = { userId: req.user.id };
  if (upcoming > 0) {
    const to = new Date();
    to.setDate(to.getDate() + upcoming);
    where.dueDate = { lte: to };
  }
  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
  });
  res.json(tasks);
});

app.post("/tasks", auth, async (req, res) => {
  const { title, dueDate } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: "title required" });
  const t = await prisma.task.create({
    data: { title, userId: req.user.id, dueDate: dueDate ? new Date(dueDate) : null },
  });
  res.status(201).json(t);
});

app.patch("/tasks/:id", auth, async (req, res) => {
  const { id } = req.params;
  const { title, dueDate, status } = req.body;
  const task = await prisma.task.findFirst({ where: { id, userId: req.user.id } });
  if (!task) return res.status(404).json({ error: "task not found" });
  const updated = await prisma.task.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(status !== undefined ? { status } : {}),
    },
  });
  res.json(updated);
});

app.delete("/tasks/:id", auth, async (req, res) => {
  const { id } = req.params;
  const task = await prisma.task.findFirst({ where: { id, userId: req.user.id } });
  if (!task) return res.status(404).json({ error: "task not found" });
  await prisma.task.delete({ where: { id } });
  res.json({ ok: true });
});

// ---- 404 fallback (EN ALTA OLMALI)
app.use((_req, res) => res.status(404).json({ error: "not found" }));

// ---- Start & graceful shutdown
const server = app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));

const stop = async () => {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
