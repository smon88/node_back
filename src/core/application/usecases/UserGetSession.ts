import type { SessionRepository } from "../ports/SessionRepository.js";

export class UserGetSession {
  constructor(private repo: SessionRepository) {}

  async execute(input: { sessionId: string }) {
    const sessionId = (input.sessionId || "").trim();
    if (!sessionId) return { ok: false as const, error: "missing_sessionId" };

    const session = await this.repo.findById(sessionId);
    if (!session) return { ok: false as const, error: "not_found" };

    return { ok: true as const, session };
  }
}
