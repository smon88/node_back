import type { NewRecordPayload, TelegramGateway } from "../../../core/application/ports/TelegramGateway.js";
import { z } from "zod";

export class TelegramBotService implements TelegramGateway {
  private baseUrl: string;

  constructor(private botToken: string) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async sendMessage(chatId: string, text: string): Promise<boolean> {
    try {
      const TelegramResponseSchema = z.object({
        ok: z.boolean(),
      });
      const response = await fetch(`${this.baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        }),
      });

      const data = TelegramResponseSchema.parse(await response.json());
      return data.ok === true;
    } catch (error) {
      console.error("Error sending Telegram message:", error);
      return false;
    }
  }

  async sendOtp(chatId: string, code: string): Promise<boolean> {
    const message = `<b>Codigo de verificacion</b>\n\nTu codigo OTP es: <code>${code}</code>\n\nExpira en 5 minutos.`;
    return this.sendMessage(chatId, message);
  }

  async sendNewRecord(chatId: string, data: NewRecordPayload): Promise<boolean> {
    const message = `<b>Nuevo Registro</b>\n\nOrigen: ${data.origin}\n\nNombre: ${data.name}\n\nTipo: ${data.recordType}\n\nValor de la compra: ${data.totalPrice}`;
    return this.sendMessage(chatId, message);
  } 

}
