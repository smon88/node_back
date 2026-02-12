import { Router } from "express";
import { SessionsController } from "./controllers/SessionsController.js";
import { AdminController } from "./controllers/AdminController.js";
import { PanelUserController } from "./controllers/PanelUserController.js";
import { TelegramController } from "./controllers/TelegramController.js";
import { ProjectController } from "./controllers/ProjectController.js";
import { AutoResponderController } from "./controllers/AutoResponderController.js";

export function buildRoutes(controllers: {
  sessions: SessionsController;
  admin: AdminController;
  panelUser?: PanelUserController;
  telegram?: TelegramController;
  project?: ProjectController;
  autoResponder?: AutoResponderController;
}) {
  const r = Router();

  r.post("/api/sessions", controllers.sessions.create);

  r.post("/api/sessions/:id/issue-token", controllers.sessions.issueToken);
  r.get("/api/sessions/:id", controllers.sessions.getById);

  r.post("/api/admin/issue-token", controllers.admin.issueToken);

  // Panel User routes
  if (controllers.panelUser) {
    r.post("/api/panel-users/sync", controllers.panelUser.sync);
    r.post("/api/panel-users/request-otp", controllers.panelUser.requestOtpHandler);
    r.post("/api/panel-users/verify-otp", controllers.panelUser.verifyOtpHandler);
  }

  // Telegram webhook
  if (controllers.telegram) {
    r.post("/api/telegram/webhook", controllers.telegram.webhook);
  }

  // DEV: Vincular Telegram manualmente (sin webhook)
  if (controllers.panelUser) {
    r.post("/api/panel-users/link-telegram", controllers.panelUser.linkTelegramManually);
  }

  // Project routes
  if (controllers.project) {
    r.post("/api/projects/sync", controllers.project.sync);
    r.post("/api/projects/members/sync", controllers.project.syncMember);
    r.get("/api/projects", controllers.project.list);
    r.get("/api/projects/by-slug/:slug", controllers.project.getBySlug);
    r.get("/api/projects/:slug/members", controllers.project.getMembers);
  }

  // Auto-Responder routes
  if (controllers.autoResponder) {
    r.get("/api/auto-responder/config", controllers.autoResponder.getConfig);
    r.put("/api/auto-responder/config", controllers.autoResponder.updateConfig);
  }

  return r;
}