import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();
const chatClients = new Map();

// ---- Config
const JWT_SECRET = process.env.JWT_SECRET || "change-this";
const PORT = process.env.PORT || 5000;

// CORS_ORIGIN: "http://localhost:5173,http://127.0.0.1:5173" gibi yazabilirsin
const CORS_ORIGIN_RAW = process.env.CORS_ORIGIN || "http://localhost:5173";
const CORS_ORIGINS = CORS_ORIGIN_RAW.split(",").map((s) => s.trim()).filter(Boolean);

// ---- Middlewares
app.use(
  cors({
    origin: (origin, cb) => {
      // Postman/curl gibi origin göndermeyenleri de kabul et
      if (!origin) return cb(null, true);
      if (CORS_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`), false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "8mb" }));

// ---- Helpers
function signTokens(user) {
  const accessToken = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
  const refreshToken = jwt.sign({ sub: user.id, type: "refresh" }, JWT_SECRET, { expiresIn: "7d" });
  return { accessToken, refreshToken };
}

// Detect once at startup whether the running Prisma client knows about
// the bannerUrl column — true only after the migration has been applied.
let SUPPORTS_BANNER = false;
(async () => {
  try {
    await prisma.user.findFirst({ select: { id: true, bannerUrl: true } });
    SUPPORTS_BANNER = true;
    console.log("[iremind] banner support: ON");
  } catch {
    SUPPORTS_BANNER = false;
    console.warn(
      "[iremind] bannerUrl column not present yet. Run `npx prisma migrate dev --name add_banner_url` (in the server folder) to enable the banner feature."
    );
  }
})();

function pickUserSafe(u) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    bannerUrl: SUPPORTS_BANNER ? (u.bannerUrl ?? null) : null,
    about: u.about,
    status: u.status,
    avatarSize: u.avatarSize,
  };
}

// Returns a fresh plain select object each time — always safe for Prisma.
function userPublicSelect() {
  const base = {
    id: true,
    email: true,
    displayName: true,
    avatarUrl: true,
    about: true,
    status: true,
    avatarSize: true,
  };
  if (SUPPORTS_BANNER) base.bannerUrl = true;
  return base;
}

function pushChatEvent(userId, payload) {
  const clients = chatClients.get(userId);
  if (!clients) return;
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((client) => client.write(message));
}

// ---- Auth middleware
async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: "missing token" });

    const payload = jwt.verify(token, JWT_SECRET);
    const userId = payload.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: userPublicSelect(),
    });
    if (!user) return res.status(401).json({ success: false, error: "user not found" });

    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: "invalid token" });
  }
}

// ---- Health
app.get("/", (_req, res) => res.redirect("/health"));
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---- API routes
const api = express.Router();

// auth: register
api.post("/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    // hem displayName hem display_name kabul
    const displayName = req.body.displayName ?? req.body.display_name;

    if (!email || !password || !displayName) {
      return res.status(400).json({
        success: false,
        error: "missing fields",
        hint: "Body must include: email, password, displayName",
      });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ success: false, error: "email in use" });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, passwordHash, displayName },
      select: userPublicSelect(),
    });

    const tokens = signTokens(user);
    return res.status(201).json({ success: true, user, ...tokens });
  } catch (e) {
    console.error("REGISTER ERR:", e);
    return res.status(500).json({ success: false, error: "server error" });
  }
});

// auth: login
api.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: "missing fields" });

    const dbUser = await prisma.user.findUnique({ where: { email } });
    if (!dbUser) return res.status(401).json({ success: false, error: "invalid credentials" });

    const ok = await bcrypt.compare(password, dbUser.passwordHash);
    if (!ok) return res.status(401).json({ success: false, error: "invalid credentials" });

    const user = pickUserSafe(dbUser);
    const tokens = signTokens(user);
    return res.json({ success: true, user, ...tokens });
  } catch (e) {
    console.error("LOGIN ERR:", e);
    return res.status(500).json({ success: false, error: "server error" });
  }
});

// auth: refresh
api.post("/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ success: false, error: "missing refreshToken" });

    const payload = jwt.verify(refreshToken, JWT_SECRET);
    if (payload.type !== "refresh") return res.status(401).json({ success: false, error: "invalid refresh token" });

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: userPublicSelect(),
    });

    if (!user) return res.status(401).json({ success: false, error: "user not found" });

    const tokens = signTokens(user);
    return res.json({ success: true, user, ...tokens });
  } catch (e) {
    return res.status(401).json({ success: false, error: "invalid refresh token" });
  }
});

// (İstersen sonra notebooks/notes/tasks endpointlerini de buraya taşırız)
api.get("/me", auth, async (req, res) => {
  res.json({ success: true, user: req.user });
});

api.patch("/me/profile", auth, async (req, res) => {
  try {
    const { displayName, avatarUrl, bannerUrl, email, about, status, avatarSize } = req.body;

    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== req.user.id) {
        return res.status(409).json({ success: false, error: "email in use" });
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        ...(bannerUrl !== undefined && SUPPORTS_BANNER ? { bannerUrl } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(about !== undefined ? { about } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(avatarSize !== undefined ? { avatarSize: Number(avatarSize) || 72 } : {}),
      },
      select: userPublicSelect(),
    });

    res.json({ success: true, user });
  } catch (e) {
    console.error("UPDATE PROFILE ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.patch("/me/password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: "missing fields" });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, error: "new password must be at least 6 characters" });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ success: false, error: "user not found" });

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ success: false, error: "current password is incorrect" });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });

    res.json({ success: true });
  } catch (e) {
    console.error("UPDATE PASSWORD ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});


api.get("/tasks", auth, async (req, res) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, tasks });
  } catch (e) {
    console.error("GET TASKS ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.post("/tasks", auth, async (req, res) => {
  try {
    const { title, note, priority, dueDate } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: "title is required",
      });
    }

    const task = await prisma.task.create({
      data: {
        title,
        note: note || null,
        priority: priority || "MEDIUM",
        dueDate: dueDate ? new Date(dueDate) : null,
        userId: req.user.id,
      },
    });

    res.status(201).json({ success: true, task });
  } catch (e) {
    console.error("CREATE TASK ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.patch("/tasks/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, note, status, priority, dueDate, isFocus } = req.body;

    const task = await prisma.task.updateMany({
      where: {
        id,
        userId: req.user.id,
      },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(dueDate !== undefined
          ? { dueDate: dueDate ? new Date(dueDate) : null }
          : {}),
        ...(isFocus !== undefined ? { isFocus } : {}),
      },
    });

    if (task.count === 0) {
      return res.status(404).json({
        success: false,
        error: "task not found",
      });
    }

    res.json({ success: true });
  } catch (e) {
    console.error("UPDATE TASK ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.patch("/tasks/:id/focus", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.task.findFirst({
      where: {
        id,
        userId: req.user.id,
      },
      select: { isFocus: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "task not found",
      });
    }

    if (existing.isFocus) {
      await prisma.task.update({
        where: { id },
        data: { isFocus: false },
      });

      return res.json({ success: true, isFocus: false });
    }

    await prisma.task.updateMany({
      where: { userId: req.user.id },
      data: { isFocus: false },
    });

    await prisma.task.update({
      where: { id },
      data: { isFocus: true },
    });

    res.json({ success: true, isFocus: true });
  } catch (e) {
    console.error("SET FOCUS TASK ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.delete("/tasks/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await prisma.task.deleteMany({
      where: {
        id,
        userId: req.user.id,
      },
    });

    if (task.count === 0) {
      return res.status(404).json({
        success: false,
        error: "task not found",
      });
    }

    res.json({ success: true });
  } catch (e) {
    console.error("DELETE TASK ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.get("/notes", auth, async (req, res) => {
  try {
    const notes = await prisma.note.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: "desc" },
    });

    res.json({ success: true, notes });
  } catch (e) {
    console.error("GET NOTES ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.post("/notes", auth, async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: "content is required",
      });
    }

    const note = await prisma.note.create({
      data: {
        title: title || "Untitled note",
        content,
        userId: req.user.id,
      },
    });

    res.status(201).json({ success: true, note });
  } catch (e) {
    console.error("CREATE NOTE ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.patch("/notes/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    const note = await prisma.note.updateMany({
      where: {
        id,
        userId: req.user.id,
      },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
      },
    });

    if (note.count === 0) {
      return res.status(404).json({
        success: false,
        error: "note not found",
      });
    }

    res.json({ success: true });
  } catch (e) {
    console.error("UPDATE NOTE ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.delete("/notes/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const note = await prisma.note.deleteMany({
      where: {
        id,
        userId: req.user.id,
      },
    });

    if (note.count === 0) {
      return res.status(404).json({
        success: false,
        error: "note not found",
      });
    }

    res.json({ success: true });
  } catch (e) {
    console.error("DELETE NOTE ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.get("/events", auth, async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: { userId: req.user.id },
      orderBy: { startsAt: "asc" },
    });

    res.json({ success: true, events });
  } catch (e) {
    console.error("GET EVENTS ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.post("/events", auth, async (req, res) => {
  try {
    const { title, note, startsAt, endsAt, color, visibility } = req.body;

    if (!title || !startsAt) {
      return res.status(400).json({
        success: false,
        error: "title and startsAt are required",
      });
    }

    const event = await prisma.event.create({
      data: {
        title,
        note: note || null,
        startsAt: new Date(startsAt),
        endsAt: endsAt ? new Date(endsAt) : null,
        color: color || null,
        visibility: visibility || "PRIVATE",
        userId: req.user.id,
      },
    });

    res.status(201).json({ success: true, event });
  } catch (e) {
    console.error("CREATE EVENT ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.patch("/events/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, note, startsAt, endsAt, color, visibility } = req.body;

    const event = await prisma.event.updateMany({
      where: {
        id,
        userId: req.user.id,
      },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(startsAt !== undefined ? { startsAt: new Date(startsAt) } : {}),
        ...(endsAt !== undefined
          ? { endsAt: endsAt ? new Date(endsAt) : null }
          : {}),
        ...(color !== undefined ? { color } : {}),
        ...(visibility !== undefined ? { visibility } : {}),
      },
    });

    if (event.count === 0) {
      return res.status(404).json({
        success: false,
        error: "event not found",
      });
    }

    res.json({ success: true });
  } catch (e) {
    console.error("UPDATE EVENT ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.delete("/events/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.deleteMany({
      where: {
        id,
        userId: req.user.id,
      },
    });

    if (event.count === 0) {
      return res.status(404).json({
        success: false,
        error: "event not found",
      });
    }

    res.json({ success: true });
  } catch (e) {
    console.error("DELETE EVENT ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.get("/study-sessions", auth, async (req, res) => {
  try {
    const sessions = await prisma.studySession.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "asc" },
    });

    res.json({ success: true, sessions });
  } catch (e) {
    console.error("GET STUDY SESSIONS ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.post("/study-sessions", auth, async (req, res) => {
  try {
    const { title, minutes } = req.body;
    const cleanMinutes = Number(minutes);

    if (!Number.isFinite(cleanMinutes) || cleanMinutes <= 0) {
      return res.status(400).json({ success: false, error: "minutes must be greater than 0" });
    }

    const session = await prisma.studySession.create({
      data: {
        title: title || "Study session",
        minutes: Math.round(cleanMinutes),
        userId: req.user.id,
      },
    });

    res.status(201).json({ success: true, session });
  } catch (e) {
    console.error("CREATE STUDY SESSION ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.get("/journal", auth, async (req, res) => {
  try {
    const entries = await prisma.journalEntry.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: "desc" },
    });

    res.json({ success: true, entries });
  } catch (e) {
    console.error("GET JOURNAL ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.post("/journal", auth, async (req, res) => {
  try {
    const { title, content, mood } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: "content is required" });
    }

    const entry = await prisma.journalEntry.create({
      data: {
        title: title || "Journal entry",
        content,
        mood: mood || null,
        userId: req.user.id,
      },
    });

    res.status(201).json({ success: true, entry });
  } catch (e) {
    console.error("CREATE JOURNAL ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.patch("/journal/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, mood } = req.body;

    const entry = await prisma.journalEntry.updateMany({
      where: { id, userId: req.user.id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(mood !== undefined ? { mood } : {}),
      },
    });

    if (entry.count === 0) return res.status(404).json({ success: false, error: "journal entry not found" });
    res.json({ success: true });
  } catch (e) {
    console.error("UPDATE JOURNAL ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.delete("/journal/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const entry = await prisma.journalEntry.deleteMany({
      where: { id, userId: req.user.id },
    });

    if (entry.count === 0) return res.status(404).json({ success: false, error: "journal entry not found" });
    res.json({ success: true });
  } catch (e) {
    console.error("DELETE JOURNAL ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.get("/mind-map", auth, async (req, res) => {
  try {
    const nodes = await prisma.mindMapNode.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "asc" },
    });

    res.json({ success: true, nodes });
  } catch (e) {
    console.error("GET MIND MAP ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.post("/mind-map", auth, async (req, res) => {
  try {
    const { label, note, parentId, color } = req.body;

    if (!label) return res.status(400).json({ success: false, error: "label is required" });

    const node = await prisma.mindMapNode.create({
      data: {
        label,
        note: note || null,
        parentId: parentId || null,
        color: color || "green",
        userId: req.user.id,
      },
    });

    res.status(201).json({ success: true, node });
  } catch (e) {
    console.error("CREATE MIND MAP ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.patch("/mind-map/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { label, note, parentId, color } = req.body;

    const node = await prisma.mindMapNode.updateMany({
      where: { id, userId: req.user.id },
      data: {
        ...(label !== undefined ? { label } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
        ...(color !== undefined ? { color } : {}),
      },
    });

    if (node.count === 0) return res.status(404).json({ success: false, error: "mind map node not found" });
    res.json({ success: true });
  } catch (e) {
    console.error("UPDATE MIND MAP ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.delete("/mind-map/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const nodes = await prisma.mindMapNode.findMany({
      where: { userId: req.user.id },
      select: { id: true, parentId: true },
    });
    const idsToDelete = new Set([id]);
    let changed = true;

    while (changed) {
      changed = false;
      nodes.forEach((node) => {
        if (node.parentId && idsToDelete.has(node.parentId) && !idsToDelete.has(node.id)) {
          idsToDelete.add(node.id);
          changed = true;
        }
      });
    }

    const deleted = await prisma.mindMapNode.deleteMany({
      where: { userId: req.user.id, id: { in: [...idsToDelete] } },
    });

    if (deleted.count === 0) return res.status(404).json({ success: false, error: "mind map node not found" });
    res.json({ success: true });
  } catch (e) {
    console.error("DELETE MIND MAP ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.get("/reminders", auth, async (req, res) => {
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const [events, tasks, completions] = await Promise.all([
      prisma.event.findMany({
        where: {
          userId: req.user.id,
          startsAt: { gte: now, lte: tomorrow },
        },
        orderBy: { startsAt: "asc" },
      }),
      prisma.task.findMany({
        where: {
          userId: req.user.id,
          status: { not: "DONE" },
          dueDate: { gte: now, lte: tomorrow },
        },
        orderBy: { dueDate: "asc" },
      }),
      prisma.reminderCompletion.findMany({
        where: { userId: req.user.id },
      }),
    ]);

    const done = new Set(completions.map((item) => `${item.sourceType}:${item.sourceId}`));
    const reminders = [
      ...events.map((event) => ({
        id: `EVENT:${event.id}`,
        sourceType: "EVENT",
        sourceId: event.id,
        title: event.title,
        note: event.note,
        dueAt: event.startsAt,
        kind: "Calendar event",
        completed: done.has(`EVENT:${event.id}`),
      })),
      ...tasks.map((task) => ({
        id: `TASK:${task.id}`,
        sourceType: "TASK",
        sourceId: task.id,
        title: task.title,
        note: task.note,
        dueAt: task.dueDate,
        kind: "To-do task",
        completed: done.has(`TASK:${task.id}`),
      })),
    ].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

    res.json({ success: true, reminders });
  } catch (e) {
    console.error("GET REMINDERS ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.post("/reminders/complete", auth, async (req, res) => {
  try {
    const { sourceType, sourceId } = req.body;
    if (!sourceType || !sourceId) return res.status(400).json({ success: false, error: "missing fields" });

    await prisma.reminderCompletion.upsert({
      where: {
        sourceType_sourceId_userId: {
          sourceType,
          sourceId,
          userId: req.user.id,
        },
      },
      update: { completedAt: new Date() },
      create: { sourceType, sourceId, userId: req.user.id },
    });

    res.json({ success: true });
  } catch (e) {
    console.error("COMPLETE REMINDER ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.get("/chat/me", auth, async (req, res) => {
  res.json({ success: true, user: req.user });
});

api.get("/chat/user/:id", auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: userPublicSelect(),
    });
    if (!user) return res.status(404).json({ success: false, error: "user not found" });
    res.json({ success: true, user });
  } catch (e) {
    console.error("GET CHAT USER ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.get("/chat/friends", auth, async (req, res) => {
  try {
    const rows = await prisma.friendship.findMany({
      where: {
        OR: [{ requesterId: req.user.id }, { receiverId: req.user.id }],
      },
      include: {
        requester: { select: userPublicSelect() },
        receiver: { select: userPublicSelect() },
      },
      orderBy: { createdAt: "desc" },
    });

    const friends = rows.map((row) => row.requesterId === req.user.id ? row.receiver : row.requester);
    res.json({ success: true, friends });
  } catch (e) {
    console.error("GET FRIENDS ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.post("/chat/friends", auth, async (req, res) => {
  try {
    const { friendId } = req.body;
    if (!friendId || friendId === req.user.id) {
      return res.status(400).json({ success: false, error: "invalid friend id" });
    }

    const friend = await prisma.user.findUnique({ where: { id: friendId }, select: userPublicSelect() });
    if (!friend) return res.status(404).json({ success: false, error: "user not found" });

    const exists = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: req.user.id, receiverId: friendId },
          { requesterId: friendId, receiverId: req.user.id },
        ],
      },
    });

    if (!exists) {
      await prisma.friendship.create({
        data: { requesterId: req.user.id, receiverId: friendId },
      });
    }

    res.status(201).json({ success: true, friend });
  } catch (e) {
    console.error("ADD FRIEND ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.delete("/chat/friends/:id", auth, async (req, res) => {
  try {
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: req.user.id, receiverId: req.params.id },
          { requesterId: req.params.id, receiverId: req.user.id },
        ],
      },
    });
    res.json({ success: true });
  } catch (e) {
    console.error("DELETE FRIEND ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.get("/chat/messages/:friendId", auth, async (req, res) => {
  try {
    const friendId = req.params.friendId;
    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: req.user.id, receiverId: friendId },
          { senderId: friendId, receiverId: req.user.id },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    await prisma.chatMessage.updateMany({
      where: { senderId: friendId, receiverId: req.user.id, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ success: true, messages });
  } catch (e) {
    console.error("GET MESSAGES ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.post("/chat/messages", auth, async (req, res) => {
  try {
    const { receiverId, body } = req.body;
    if (!receiverId || !body?.trim()) return res.status(400).json({ success: false, error: "missing fields" });

    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: req.user.id, receiverId },
          { requesterId: receiverId, receiverId: req.user.id },
        ],
      },
    });
    if (!friendship) return res.status(403).json({ success: false, error: "add this user as a friend first" });

    const message = await prisma.chatMessage.create({
      data: {
        senderId: req.user.id,
        receiverId,
        body: body.trim(),
      },
    });

    pushChatEvent(receiverId, { type: "message", message });
    pushChatEvent(req.user.id, { type: "message", message });
    res.status(201).json({ success: true, message });
  } catch (e) {
    console.error("SEND MESSAGE ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

api.get("/chat/unread-count", auth, async (req, res) => {
  try {
    const count = await prisma.chatMessage.count({
      where: { receiverId: req.user.id, readAt: null },
    });
    res.json({ success: true, count });
  } catch (e) {
    console.error("UNREAD COUNT ERR:", e);
    res.status(500).json({ success: false, error: "server error" });
  }
});

app.get("/api/chat/stream", async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(401).end();
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = payload.sub;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    const clients = chatClients.get(userId) || new Set();
    clients.add(res);
    chatClients.set(userId, clients);

    req.on("close", () => {
      clients.delete(res);
      if (!clients.size) chatClients.delete(userId);
    });
  } catch {
    res.status(401).end();
  }
});



app.use("/api", api);



// ---- 404
app.use((_req, res) => res.status(404).json({ success: false, error: "not found" }));

// ---- Start & graceful shutdown
const server = app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));

const stop = async () => {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
