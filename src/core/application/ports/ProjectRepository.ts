import { ProjectRole, MemberStatus, ProjectStatus } from "@prisma/client";

export type Project = {
  id: string;
  slug: string;
  name: string;
  url: string;
  logoUrl: string | null;
  description: string | null;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectCreate = {
  slug: string;
  name: string;
  url: string;
  logoUrl?: string | null;
  description?: string | null;
  status?: ProjectStatus;
};

export type ProjectPatch = Partial<Omit<Project, "id" | "createdAt">>;

export type PanelUserProject = {
  id: string;
  panelUserId: string;
  projectId: string;
  role: ProjectRole;
  status: MemberStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type PanelUserProjectCreate = {
  panelUserId: string;
  projectId: string;
  role?: ProjectRole;
  status?: MemberStatus;
};

export type PanelUserProjectPatch = {
  role?: ProjectRole;
  status?: MemberStatus;
};

export interface ProjectRepository {
  findById(id: string): Promise<Project | null>;
  findBySlug(slug: string): Promise<Project | null>;
  findAll(onlyActive?: boolean): Promise<Project[]>;
  create(data: ProjectCreate): Promise<Project>;
  update(id: string, patch: ProjectPatch): Promise<Project>;
  delete(id: string): Promise<void>;

  // Members
  findMember(panelUserId: string, projectId: string): Promise<PanelUserProject | null>;
  findMembersByProject(projectId: string, status?: MemberStatus): Promise<PanelUserProject[]>;
  findProjectsByUser(panelUserId: string, status?: MemberStatus): Promise<PanelUserProject[]>;
  addMember(data: PanelUserProjectCreate): Promise<PanelUserProject>;
  updateMember(panelUserId: string, projectId: string, patch: PanelUserProjectPatch): Promise<PanelUserProject>;
  removeMember(panelUserId: string, projectId: string): Promise<void>;
}
