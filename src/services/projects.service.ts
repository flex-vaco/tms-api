import { UserRole } from '@prisma/client';
import { prisma } from '../utils/db';
import { CreateProjectDto, UpdateProjectDto } from '../types';
import { NotFoundError, ConflictError, ForbiddenError } from '../types/errors';
import { DEFAULT_PAGE, DEFAULT_LIMIT } from '../utils/constants';
import { getDirectReportIds } from './team.service';

const PROJECT_INCLUDE = {
  managers: {
    include: {
      manager: { select: { id: true, name: true } },
    },
  },
  assignedEmployees: {
    include: {
      employee: { select: { id: true, name: true } },
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

  // EMPLOYEE sees only projects assigned to them; MANAGER + ADMIN see all org projects
  const where = role === UserRole.EMPLOYEE
    ? { organisationId: orgId, assignedEmployees: { some: { employeeId: userId } } }
    : { organisationId: orgId };

  const [data, total] = await prisma.$transaction([
    prisma.project.findMany({
      where,
      include: PROJECT_INCLUDE,
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

  const { managerIds, employeeIds, ...projectData } = dto;

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

  // Guard: MANAGER can only assign their direct reports
  if (employeeIds?.length && creatingUserRole === UserRole.MANAGER) {
    const directReportIds = await getDirectReportIds(creatingUserId, orgId);
    const directReportSet = new Set(directReportIds);
    const unauthorized = employeeIds.filter((id) => !directReportSet.has(id));
    if (unauthorized.length > 0) {
      throw new ForbiddenError('Managers can only assign their direct reports to projects');
    }
  }

  const project = await prisma.project.create({
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
      ...(employeeIds?.length
        ? { assignedEmployees: { create: employeeIds.map((employeeId) => ({ employeeId })) } }
        : {}),
    },
    include: PROJECT_INCLUDE,
  });

  return project;
}

export async function updateProject(
  id: number,
  orgId: number,
  dto: UpdateProjectDto,
  requestingUserId: number,
  requestingRole: UserRole
) {
  const project = await prisma.project.findFirst({ where: { id, organisationId: orgId } });
  if (!project) throw new NotFoundError('Project');

  if (dto.code && dto.code !== project.code) {
    const codeConflict = await prisma.project.findFirst({
      where: { organisationId: orgId, code: dto.code, NOT: { id } },
    });
    if (codeConflict) throw new ConflictError(`Project code "${dto.code}" already exists`);
  }

  const { managerIds, employeeIds, ...projectData } = dto;

  // Guard: MANAGER can only assign their direct reports
  if (employeeIds !== undefined && requestingRole === UserRole.MANAGER) {
    const directReportIds = await getDirectReportIds(requestingUserId, orgId);
    const directReportSet = new Set(directReportIds);
    const unauthorized = employeeIds.filter((eid) => !directReportSet.has(eid));
    if (unauthorized.length > 0) {
      throw new ForbiddenError('Managers can only assign their direct reports to projects');
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: projectData });

    if (managerIds !== undefined) {
      await tx.projectManager.deleteMany({ where: { projectId: id } });
      if (managerIds.length > 0) {
        await tx.projectManager.createMany({
          data: managerIds.map((managerId) => ({ projectId: id, managerId })),
        });
      }
    }

    if (employeeIds !== undefined) {
      await tx.projectEmployee.deleteMany({ where: { projectId: id } });
      if (employeeIds.length > 0) {
        await tx.projectEmployee.createMany({
          data: employeeIds.map((employeeId) => ({ projectId: id, employeeId })),
        });
      }
    }

    return tx.project.findUnique({
      where: { id },
      include: PROJECT_INCLUDE,
    });
  });
}

export async function deleteProject(id: number, orgId: number): Promise<void> {
  const project = await prisma.project.findFirst({ where: { id, organisationId: orgId } });
  if (!project) throw new NotFoundError('Project');
  await prisma.project.delete({ where: { id } });
}
