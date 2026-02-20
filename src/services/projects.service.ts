import { UserRole } from '@prisma/client';
import { prisma } from '../utils/db';
import { CreateProjectDto, UpdateProjectDto } from '../types';
import { NotFoundError, ConflictError } from '../types/errors';
import { DEFAULT_PAGE, DEFAULT_LIMIT } from '../utils/constants';

const MANAGER_INCLUDE = {
  managers: {
    include: {
      manager: { select: { id: true, name: true } },
    },
  },
} as const;

export async function listProjects(
  orgId: number,
  userId: number,
  role: UserRole,
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT
) {
  const skip = (page - 1) * limit;

  // MANAGER sees only projects assigned to them; ADMIN + EMPLOYEE see all
  const where = role === UserRole.MANAGER
    ? { organisationId: orgId, managers: { some: { managerId: userId } } }
    : { organisationId: orgId };

  const [data, total] = await prisma.$transaction([
    prisma.project.findMany({
      where,
      include: MANAGER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.project.count({ where }),
  ]);
  return { data, meta: { total, page, limit } };
}

export async function createProject(
  orgId: number,
  dto: CreateProjectDto,
  creatingUserId: number,
  creatingUserRole: UserRole
) {
  const existing = await prisma.project.findFirst({
    where: { organisationId: orgId, code: dto.code },
  });
  if (existing) throw new ConflictError(`Project code "${dto.code}" already exists in this organisation`);

  const { managerIds, ...projectData } = dto;

  // Build manager assignment list
  const managerCreateList: { managerId: number }[] = [];
  if (creatingUserRole === UserRole.MANAGER) {
    // Auto-assign creating manager
    managerCreateList.push({ managerId: creatingUserId });
    // Add any additional requested managers (excluding self to avoid duplicate)
    if (managerIds?.length) {
      for (const id of managerIds) {
        if (id !== creatingUserId) managerCreateList.push({ managerId: id });
      }
    }
  } else if (managerIds?.length) {
    for (const id of managerIds) {
      managerCreateList.push({ managerId: id });
    }
  }

  return prisma.project.create({
    data: {
      organisationId: orgId,
      code: projectData.code,
      name: projectData.name,
      client: projectData.client,
      budgetHours: projectData.budgetHours ?? 0,
      status: projectData.status ?? 'active',
      ...(managerCreateList.length > 0
        ? { managers: { create: managerCreateList } }
        : {}),
    },
    include: MANAGER_INCLUDE,
  });
}

export async function updateProject(id: number, orgId: number, dto: UpdateProjectDto) {
  const project = await prisma.project.findFirst({ where: { id, organisationId: orgId } });
  if (!project) throw new NotFoundError('Project');

  if (dto.code && dto.code !== project.code) {
    const codeConflict = await prisma.project.findFirst({
      where: { organisationId: orgId, code: dto.code, NOT: { id } },
    });
    if (codeConflict) throw new ConflictError(`Project code "${dto.code}" already exists`);
  }

  const { managerIds, ...projectData } = dto;

  return prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: projectData });

    if (managerIds !== undefined) {
      // Replace all manager assignments
      await tx.projectManager.deleteMany({ where: { projectId: id } });
      if (managerIds.length > 0) {
        await tx.projectManager.createMany({
          data: managerIds.map((managerId) => ({ projectId: id, managerId })),
        });
      }
    }

    return tx.project.findUnique({
      where: { id },
      include: MANAGER_INCLUDE,
    });
  });
}

export async function deleteProject(id: number, orgId: number): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id, organisationId: orgId } });
  if (!project) throw new NotFoundError('Project');
  await prisma.project.delete({ where: { id } });
}
