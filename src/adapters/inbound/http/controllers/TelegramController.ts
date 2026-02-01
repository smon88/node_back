import { type Request, type Response } from "express";
import { HandleTelegramUpdate } from "../../../../core/application/usecases/panelUser/HandleTelegramUpdate.js";

export class TelegramController {
  constructor(
    private handleTelegramUpdate: HandleTelegramUpdate,
    private webhookSecret?: string
  ) {}

  webhook = (req: Request, res: Response) => {
  // 1) Validar webhook secret
  if (this.webhookSecret) {
    const providedSecret = req.header("X-Telegram-Bot-Api-Secret-Token");
    if (!providedSecret || providedSecret !== this.webhookSecret) {
      return res.sendStatus(401);
    }
  }

  // 2) Responder de inmediato (Telegram no necesita más)
  res.sendStatus(200);

  // 3) Procesar en “background” dentro del mismo proceso
  // (sin bloquear la respuesta)
  Promise.resolve()
    .then(() => this.handleTelegramUpdate.execute(req.body))
    .catch((error) => {
      console.error("Error handling Telegram update:", error);
    });
};
}
