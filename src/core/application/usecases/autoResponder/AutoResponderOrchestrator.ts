import type { AutoResponderTimer } from "../../ports/AutoResponderTimer.js";
import type { SessionRepository, Session } from "../../ports/SessionRepository.js";
import type {
  AutoResponderConfigData,
  PrismaAutoResponderConfigRepository,
} from "../../../../adapters/outbound/db/PrismaAutoResponderConfigRepository.js";

type AdminAction = {
  execute(input: { sessionId: string }): Promise<{ ok: boolean }>;
};

export class AutoResponderOrchestrator {
  private config: AutoResponderConfigData | null = null;

  constructor(
    private configRepo: PrismaAutoResponderConfigRepository,
    private timer: AutoResponderTimer,
    private actionMap: Record<string, AdminAction>,
    private sessionRepo: SessionRepository,
  ) {}

  /** Load config from DB into memory. Call once on startup. */
  async loadConfig(): Promise<AutoResponderConfigData> {
    this.config = await this.configRepo.get();
    console.log("[AutoResponder] Config loaded:", {
      enabled: this.config.enabled,
      timeout: this.config.timeout,
    });
    return this.config;
  }

  /**
   * Called by the gateway hook every time a session is upserted.
   * Synchronous decision based on cached config — no DB reads.
   */
  onSessionChanged(session: Session): void {
    if (!this.config?.enabled) return;

    const action = session.action as string;

    if (action.endsWith("_WAIT_ACTION")) {
      const targetAction = this.config.actions[action];
      if (!targetAction) return;

      const useCase = this.actionMap[targetAction];
      if (!useCase) return;

      const timeoutMs = this.config.timeout * 1000;

      this.timer.schedule(session.id, timeoutMs, async () => {
        console.log(
          `[AutoResponder] Firing ${targetAction} for session ${session.id} (was ${action})`,
        );
        try {
          await useCase.execute({ sessionId: session.id });
        } catch (e) {
          console.error("[AutoResponder] Action failed:", e);
        }
      });
    } else {
      this.timer.cancel(session.id);
    }
  }

  /** Scan existing sessions and start timers for any in WAIT_ACTION state. */
  async recheckAllSessions(): Promise<void> {
    if (!this.config?.enabled) return;

    const sessions = await this.sessionRepo.listRecent(500);
    let started = 0;

    for (const s of sessions) {
      const action = s.action as string;
      if (action.endsWith("_WAIT_ACTION")) {
        this.onSessionChanged(s);
        started++;
      }
    }

    if (started > 0) {
      console.log(`[AutoResponder] Started ${started} timers on recheck`);
    }
  }

  /** Read current config (from cache). */
  getConfig(): AutoResponderConfigData | null {
    return this.config;
  }

  /** Update config in DB + cache, restart all timers. */
  async updateConfig(
    patch: Partial<Omit<AutoResponderConfigData, "id">>,
  ): Promise<AutoResponderConfigData> {
    const updated = await this.configRepo.upsert(patch);
    this.config = updated;
    this.timer.cancelAll();

    if (updated.enabled) {
      await this.recheckAllSessions();
    }

    console.log("[AutoResponder] Config updated:", {
      enabled: updated.enabled,
      timeout: updated.timeout,
    });

    return updated;
  }

  /** Get deadline for a specific session (for augmenting upsert payloads). */
  getDeadline(sessionId: string): number | null {
    return this.timer.getDeadline(sessionId);
  }
}
