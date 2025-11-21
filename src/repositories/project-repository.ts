import prisma from '../config/db';
import { task_status } from '@prisma/client';

// interface CreateProjectParams {
//   creatorId: number;
//   name: string;
//   description?: string;
// }

interface UpdateProjectParams {
  projectId: number;
  name?: string;
  description?: string;
}

interface GetProjectWithCounts {
  data: {
    id: number;
    name: string;
    description: string;
    memberCount: number;
    todoCount: number;
    inProgressCount: number;
    doneCount: number;
    creatorId: number;
  };
}

export const countProjectsByCreator = async (creatorId: number): Promise<number> => {
  return await prisma.projects.count({
    where: { creatorId },
  });
};

export const createProjectWithMember = async (params: {
  creatorId: number;
  name: string;
  description?: string;
}) => {
  return prisma.$transaction(async (tx) => {
    const project = await tx.projects.create({
      data: {
        name: params.name,
        description: params.description ?? '',
        creatorId: params.creatorId,
      },
      select: { id: true, name: true, description: true },
    });

    await tx.project_members.create({
      data: {
        projectId: project.id,
        userId: params.creatorId,
      },
    });

    return project;
  });
};

export const getProject = async (projectId: number): Promise<GetProjectWithCounts | null> => {
  const project = await prisma.projects.findUnique({
    where: { id: projectId },
  });

  if (!project) return null;

  const memberCount = await prisma.project_members.count({
    where: { projectId },
  });

  const todoCount = await prisma.tasks.count({
    where: { projectId, status: task_status.todo },
  });

  const inProgressCount = await prisma.tasks.count({
    where: { projectId, status: task_status.inProgress },
  });

  const doneCount = await prisma.tasks.count({
    where: { projectId, status: task_status.done },
  });

  return {
    data: {
      id: project.id,
      name: project.name,
      description: project.description,
      memberCount,
      todoCount,
      inProgressCount,
      doneCount,
      creatorId: project.creatorId,
    },
  };
};

export const updateProject = async ({ projectId, name, description }: UpdateProjectParams) => {
  return prisma.projects.update({
    where: { id: projectId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
    },
  });
};

export const deleteProject = async (projectId: number) => {
  return prisma.projects.delete({
    where: { id: projectId },
  });
};

export const getProjectMembersEmails = async (projectId: number): Promise<string[]> => {
  const members = await prisma.project_members.findMany({
    where: { projectId },
    select: {
      user: {
        select: { email: true },
      },
    },
  });

  return members.map((m) => m.user.email);
};

// 프로젝트명으로, 해당 유저가 멤버인 프로젝트의 id 찾기
export const findProjectIdByNameForUser = async (
  name: string,
  userId: number
): Promise<number | null> => {
  const project = await prisma.projects.findFirst({
    where: {
      name,
      projectMembers: { some: { userId } },
    },
    select: { id: true },
  });
  return project?.id ?? null;
};

// 기본 프로젝트 id 선택 (예: 가장 먼저 합류한 프로젝트)
export const getDefaultProjectIdForUser = async (userId: number): Promise<number | null> => {
  const membership = await prisma.project_members.findFirst({
    where: { userId },
    orderBy: { id: 'asc' }, // 컬럼명은 실제 스키마에 맞게
    select: { projectId: true },
  });
  return membership?.projectId ?? null;
};
