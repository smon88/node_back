import type {
  ProjectRepository,
  Project,
  ProjectCreate,
  ProjectPatch,
  PanelUserProject,
  PanelUserProjectCreate,
  PanelUserProjectPatch,
} from "../../../core/application/ports/ProjectRepository.js";
import { MemberStatus } from "@prisma/client";
import { prisma } from "./prismaClient.js";

export class PrismaProjectRepository implements ProjectRepository {
  async findById(id: string): Promise<Project | null> {
    return prisma.project.findUnique({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Project | null> {
    return prisma.project.findUnique({ where: { slug } });
  }

  async findAll(onlyActive = true): Promise<Project[]> {
    return prisma.project.findMany({
      ...(onlyActive ? { where: { isActive: true } } : {}),
      orderBy: { createdAt: "desc" },
    });
  }

  async create(data: ProjectCreate): Promise<Project> {
    return prisma.project.create({ data });
  }

  async update(id: string, patch: ProjectPatch): Promise<Project> {
    return prisma.project.update({ where: { id }, data: patch });
  }

  async delete(id: string): Promise<void> {
    await prisma.project.delete({ where: { id } });
  }

  // Members
  async findMember(panelUserId: string, projectId: string): Promise<PanelUserProject | null> {
    return prisma.panelUserProject.findUnique({
      where: {
        panelUserId_projectId: { panelUserId, projectId },
      },
    });
  }

  async findMembersByProject(projectId: string, status?: MemberStatus): Promise<PanelUserProject[]> {
    return prisma.panelUserProject.findMany({
      where: {
        projectId,
        ...(status && { status }),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findProjectsByUser(panelUserId: string, status?: MemberStatus): Promise<PanelUserProject[]> {
    return prisma.panelUserProject.findMany({
      where: {
        panelUserId,
        ...(status && { status }),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async addMember(data: PanelUserProjectCreate): Promise<PanelUserProject> {
    return prisma.panelUserProject.create({ data });
  }

  async updateMember(
    panelUserId: string,
    projectId: string,
    patch: PanelUserProjectPatch
  ): Promise<PanelUserProject> {
    return prisma.panelUserProject.update({
      where: {
        panelUserId_projectId: { panelUserId, projectId },
      },
      data: patch,
    });
  }

  async removeMember(panelUserId: string, projectId: string): Promise<void> {
    await prisma.panelUserProject.delete({
      where: {
        panelUserId_projectId: { panelUserId, projectId },
      },
    });
  }
}
