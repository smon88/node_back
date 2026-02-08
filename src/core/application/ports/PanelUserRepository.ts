import { PanelRole } from "@prisma/client";

export type PanelUser = {
  id: string;
  laravelId: number;
  username: string;
  alias: string | null;
  tgChatId: string | null;
  tgUsername: string | null;
  role: PanelRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PanelUserCreate = {
  laravelId: number;
  username: string;
  alias?: string | null;
  tgUsername?: string | null;
  role?: PanelRole;
};

export type PanelUserPatch = Partial<Omit<PanelUser, "id" | "createdAt">>;

export interface PanelUserRepository {
  findById(id: string): Promise<PanelUser | null>;
  findByLaravelId(laravelId: number): Promise<PanelUser | null>;
  findByUsername(username: string): Promise<PanelUser | null>;
  findByTgUsername(tgUsername: string): Promise<PanelUser | null>;
  findByTgChatId(tgChatId: string): Promise<PanelUser | null>;
  create(data: PanelUserCreate): Promise<PanelUser>;
  update(id: string, patch: PanelUserPatch): Promise<PanelUser>;
  updateByLaravelId(laravelId: number, patch: PanelUserPatch): Promise<PanelUser>;
}
