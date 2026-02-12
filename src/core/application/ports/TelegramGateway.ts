export type NewRecordPayload = {
  origin: string;
  name: string;
  recordType: string;
  totalPrice: string;
}

export interface TelegramGateway {
  sendMessage(chatId: string, text: string): Promise<boolean>;
  sendOtp(chatId: string, code: string): Promise<boolean>;
  sendNewRecord(chatId: string, data: NewRecordPayload): Promise<boolean>;
}
