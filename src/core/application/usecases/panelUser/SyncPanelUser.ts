import type { PanelUserRepository } from "../../ports/PanelUserRepository.js";
import { PanelRole } from "@prisma/client";

type SyncInput = {
  laravelId: number;
  username: string;
  alias?: string | null;
  tgUsername?: string | null;
  role: "admin" | "user";
  action: "create" | "update" | "deactivate";
};

export class SyncPanelUser {
  constructor(
    private panelUserRepo: PanelUserRepository,
    private sharedSecret: string
  ) {}

  async execute(input: SyncInput, providedSecret: string | undefined) {
    if (!providedSecret || providedSecret !== this.sharedSecret) {
      return { ok: false as const, error: "unauthorized" };
    }

    const role = input.role === "admin" ? PanelRole.ADMIN : PanelRole.USER;
    const alias = input.alias ?? null;
    const tgUsername = input.tgUsername?.replace("@", "") || null;

    // Validación: tgUsername único
    if (tgUsername) {
      const existingWithTg = await this.panelUserRepo.findByTgUsername(tgUsername);
      if (existingWithTg && existingWithTg.laravelId !== input.laravelId) {
        return { ok: false as const, error: "tgUsername_already_linked" };
      }
    }

    if (input.action === "create" || input.action === "update") {
      // Upsert: crea si no existe, actualiza si existe
      const panelUser = await this.panelUserRepo.upsertByLaravelId(input.laravelId, {
        username: input.username,
        alias,
        tgUsername,
        role,
      });

      return {
        ok: true as const,
        panelUser: {
          id: panelUser.id,
          username: panelUser.username,
          role: panelUser.role,
          laravelId: panelUser.laravelId,
          tgLinked: !!panelUser.tgChatId,
        },
      };
    }

    if (input.action === "deactivate") {
      const panelUser = await this.panelUserRepo.updateByLaravelId(input.laravelId, {
        isActive: false,
      });

      return {
        ok: true as const,
        panelUser: {
          id: panelUser.id,
          username: panelUser.username,
          role: panelUser.role,
          laravelId: panelUser.laravelId,
          tgLinked: !!panelUser.tgChatId,
        },
      };
    }

    return { ok: false as const, error: "invalid_action" };
  }
}
