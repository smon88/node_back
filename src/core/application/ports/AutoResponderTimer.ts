export interface AutoResponderTimer {
  schedule(sessionId: string, delayMs: number, fn: () => Promise<void>): void;
  cancel(sessionId: string): void;
  cancelAll(): void;
  getDeadline(sessionId: string): number | null;
}
