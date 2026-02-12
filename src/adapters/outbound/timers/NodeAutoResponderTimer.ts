import type { AutoResponderTimer } from "../../../core/application/ports/AutoResponderTimer.js";

export class NodeAutoResponderTimer implements AutoResponderTimer {
  private timers = new Map<string, { timerId: NodeJS.Timeout; deadline: number }>();

  schedule(sessionId: string, delayMs: number, fn: () => Promise<void>) {
    this.cancel(sessionId);

    const deadline = Date.now() + delayMs;
    const timerId = setTimeout(async () => {
      this.timers.delete(sessionId);
      try {
        await fn();
      } catch (e) {
        console.error("[AutoResponder] timer fn error:", e);
      }
    }, delayMs);

    this.timers.set(sessionId, { timerId, deadline });
  }

  cancel(sessionId: string) {
    const entry = this.timers.get(sessionId);
    if (entry) {
      clearTimeout(entry.timerId);
      this.timers.delete(sessionId);
    }
  }

  cancelAll() {
    for (const [, entry] of this.timers) {
      clearTimeout(entry.timerId);
    }
    this.timers.clear();
  }

  getDeadline(sessionId: string): number | null {
    return this.timers.get(sessionId)?.deadline ?? null;
  }
}
