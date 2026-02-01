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

    if (input.action === "create") {
      // Verificar si ya existe por laravelId o username
      let existing = await this.panelUserRepo.findByLaravelId(input.laravelId);
      if (!existing) {
        existing = await this.panelUserRepo.findByUsername(input.username);
      }

      if (existing) {
        // Ya existe, retornar datos actuales
        return {
          ok: true as const,
          panelUser: {
            id: existing.id,
            username: existing.username,
            role: existing.role,
            laravelId: existing.laravelId,
            tgLinked: !!existing.tgChatId,
          },
        };
      }
      const alias = input.alias ?? null;

      const panelUser = await this.panelUserRepo.create({
        laravelId: input.laravelId,
        username: input.username,
        alias: alias,
        tgUsername: input.tgUsername?.replace("@", "") || null,
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


    if (input.action === "update") {
      const alias = input.alias ?? null;
      const panelUser = await this.panelUserRepo.updateByLaravelId(input.laravelId, {
        username: input.username,
        alias: alias,
        tgUsername: input.tgUsername?.replace("@", "") || null,
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
