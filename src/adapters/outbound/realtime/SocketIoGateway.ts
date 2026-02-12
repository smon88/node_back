import { Server } from "socket.io";
import { type RealtimeGateway, type PanelUserStatus, type ProjectMembershipUpdate } from "../../../core/application/ports/RealtimeGateway.js";
import { type Session } from "../../../core/application/ports/SessionRepository.js";

export class SocketIoGateway implements RealtimeGateway {
  // Mapeo de panelUserId -> socketId para mensajes directos
  private panelUserSockets = new Map<string, string>();

  // Auto-responder hooks
  private _onUpsert?: (session: Session) => void;
  private _arDeadlineProvider?: (sessionId: string) => number | null;

  constructor(private io: Server) {}

  /** Hook called BEFORE emitting admin upsert — lets auto-responder react. */
  setOnUpsert(fn: (session: Session) => void) {
    this._onUpsert = fn;
  }

  /** Provider for auto-responder deadline timestamps. */
  setArDeadlineProvider(fn: (sessionId: string) => number | null) {
    this._arDeadlineProvider = fn;
  }

  // Registrar socket de panel user
  registerPanelUser(panelUserId: string, socketId: string) {
    this.panelUserSockets.set(panelUserId, socketId);
  }

  // Desregistrar socket de panel user
  unregisterPanelUser(panelUserId: string) {
    this.panelUserSockets.delete(panelUserId);
  }

  emitSessionUpdate(sessionId: string, session: Session) {
    this.io.to(`session:${sessionId}`).emit("session:update", session);
  }

  emitAdminUpsert(session: Session) {
    // 1. Let auto-responder react first (may start/cancel timers)
    this._onUpsert?.(session);

    // 2. Augment with auto-responder deadline if active
    const deadline = this._arDeadlineProvider?.(session.id) ?? null;
    const payload = deadline ? { ...session, _arDeadline: deadline } : session;

    // 3. Broadcast to admins
    this.io.to("admins:all").emit("admin:sessions:upsert", payload);

    // Enviar a usuarios del proyecto específico (si tiene projectId)
    if (session.projectId) {
      this.io.to(`project:${session.projectId}`).emit("admin:sessions:upsert", payload);
    }
  }

  emitAdminBootstrap(socketId: string, list: Session[]) {
    // Augment each session with auto-responder deadline
    const augmented = list.map((s) => {
      const deadline = this._arDeadlineProvider?.(s.id) ?? null;
      return deadline ? { ...s, _arDeadline: deadline } : s;
    });
    this.io.to(socketId).emit("admin:sessions:bootstrap", augmented);
  }

  /** Emit auto-responder config to all admins. */
  emitAutoResponderConfig(config: unknown) {
    this.io.to("admins:all").emit("auto-responder:config", config);
  }

  // Panel user presence - notificar a admins
  emitPanelUserOnline(user: PanelUserStatus) {
    this.io.to("admins:all").emit("panel-user:online", user);
  }

  emitPanelUserOffline(odId: string) {
    this.io.to("admins:all").emit("panel-user:offline", { odId });
  }

  // Notificar a un usuario específico sobre cambio en su membresía
  emitProjectMembershipUpdate(panelUserId: string, update: ProjectMembershipUpdate) {
    const socketId = this.panelUserSockets.get(panelUserId);
    if (socketId) {
      this.io.to(socketId).emit("project:membership-update", update);
    }
  }

  // Unir socket a sala de proyecto (cuando se aprueba)
  joinProjectRoom(panelUserId: string, projectId: string) {
    const socketId = this.panelUserSockets.get(panelUserId);
    if (socketId) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.join(`project:${projectId}`);
      }
    }
  }
}
