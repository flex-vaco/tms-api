import { UserRole } from '@prisma/client';
import { prisma } from '../utils/db';
import { ValidationError, ForbiddenError } from '../types/errors';
import { ERROR_CODES } from '../utils/constants';

/**
 * Returns IDs of all employees directly managed by this manager within the org.
 */
export async function getDirectReportIds(managerId: number, orgId: number): Promise<number[]> {
  const assignments = await prisma.managerEmployee.findMany({
    where: {
      managerId,
      manager: { organisationId: orgId },
    },
    select: { employeeId: true },
  });
  return assignments.map((a) => a.employeeId);
}

/**
 * Returns IDs of all managers for a given employee within the org.
 */
export async function getManagerIds(employeeId: number, orgId: number): Promise<number[]> {
  const assignments = await prisma.managerEmployee.findMany({
    where: {
      employeeId,
      employee: { organisationId: orgId },
    },
    select: { managerId: true },
  });
  return assignments.map((a) => a.managerId);
}

/**
 * Returns full user objects for all direct reports of a manager.
 */
export async function getTeamMembers(managerId: number, orgId: number) {
  const assignments = await prisma.managerEmployee.findMany({
    where: {
      managerId,
      manager: { organisationId: orgId },
    },
    include: {
      employee: {
        select: {
          id: true, name: true, email: true, role: true,
          department: true, status: true, createdAt: true, updatedAt: true,
        },
      },
    },
  });
  return assignments.map((a) => a.employee);
}

/**
 * Returns full user objects for all managers of a given user.
 */
export async function getManagersOfUser(employeeId: number, orgId: number) {
  const assignments = await prisma.managerEmployee.findMany({
    where: {
      employeeId,
      employee: { organisationId: orgId },
    },
    include: {
      manager: {
        select: {
          id: true, name: true, email: true, role: true,
          department: true, status: true,
        },
      },
    },
  });
  return assignments.map((a) => a.manager);
}

/**
 * Replaces all manager assignments for an employee.
 * Validates: no self-assignment, all managers exist in same org with MANAGER/ADMIN role.
 */
export async function assignManagers(
  employeeId: number,
  managerIds: number[],
  orgId: number
): Promise<void> {
  if (managerIds.includes(employeeId)) {
    throw new ValidationError('A user cannot be assigned as their own manager');
  }

  if (managerIds.length > 0) {
    const validManagers = await prisma.user.findMany({
      where: {
        id: { in: managerIds },
        organisationId: orgId,
        role: { in: [UserRole.MANAGER, UserRole.ADMIN] },
        status: 'active',
      },
      select: { id: true },
    });

    const validIds = new Set(validManagers.map((m) => m.id));
    const invalidIds = managerIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw new ValidationError(
        `Invalid manager IDs: ${invalidIds.join(', ')}. Must be active users with MANAGER or ADMIN role in the same organisation.`
      );
    }
  }

  await prisma.$transaction([
    prisma.managerEmployee.deleteMany({ where: { employeeId } }),
    ...(managerIds.length > 0
      ? [
          prisma.managerEmployee.createMany({
            data: managerIds.map((managerId) => ({ managerId, employeeId })),
          }),
        ]
      : []),
  ]);
}

/**
 * Removes all ManagerEmployee records where a user is the manager.
 * Used when a user's role is changed away from MANAGER/ADMIN.
 */
export async function removeAllManagedEmployees(managerId: number): Promise<void> {
  await prisma.managerEmployee.deleteMany({ where: { managerId } });
}

// ---- Project-Employee Assignment Functions ----

/**
 * Returns IDs of all projects assigned to a given employee within the org.
 */
export async function getAssignedProjectIds(employeeId: number, orgId: number): Promise<number[]> {
  const rows = await prisma.projectEmployee.findMany({
    where: {
      employeeId,
      project: { organisationId: orgId },
    },
    select: { projectId: true },
  });
  return rows.map((r) => r.projectId);
}

/**
 * Replaces all employee assignments for a project.
 * Validates that all employees are active users in the same org.
 */
export async function assignEmployeesToProject(
  projectId: number,
  employeeIds: number[],
  orgId: number
): Promise<void> {
  if (employeeIds.length > 0) {
    const validEmployees = await prisma.user.findMany({
      where: {
        id: { in: employeeIds },
        organisationId: orgId,
        status: 'active',
      },
      select: { id: true },
    });
    const validIds = new Set(validEmployees.map((e) => e.id));
    const invalidIds = employeeIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw new ValidationError(
        `Invalid employee IDs: ${invalidIds.join(', ')}. Must be active users in the same organisation.`
      );
    }
  }

  await prisma.$transaction([
    prisma.projectEmployee.deleteMany({ where: { projectId } }),
    ...(employeeIds.length > 0
      ? [
          prisma.projectEmployee.createMany({
            data: employeeIds.map((employeeId) => ({ projectId, employeeId })),
          }),
        ]
      : []),
  ]);
}

/**
 * Replaces all project assignments for an employee.
 * Validates that all projects are active and in the same org.
 */
export async function assignProjectsToEmployee(
  employeeId: number,
  projectIds: number[],
  orgId: number
): Promise<void> {
  if (projectIds.length > 0) {
    const validProjects = await prisma.project.findMany({
      where: {
        id: { in: projectIds },
        organisationId: orgId,
        status: 'active',
      },
      select: { id: true },
    });
    const validIds = new Set(validProjects.map((p) => p.id));
    const invalidIds = projectIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0) {
      throw new ValidationError(
        `Invalid project IDs: ${invalidIds.join(', ')}. Must be active projects in the same organisation.`
      );
    }
  }

  await prisma.$transaction([
    prisma.projectEmployee.deleteMany({ where: { employeeId } }),
    ...(projectIds.length > 0
      ? [
          prisma.projectEmployee.createMany({
            data: projectIds.map((projectId) => ({ projectId, employeeId })),
          }),
        ]
      : []),
  ]);
}

/**
 * Guard: checks if a given employee is a direct report of the requesting manager.
 * Throws ForbiddenError if not.
 */
export async function assertIsDirectReport(
  managerId: number,
  employeeId: number,
  orgId: number
): Promise<void> {
  const assignment = await prisma.managerEmployee.findFirst({
    where: {
      managerId,
      employeeId,
      manager: { organisationId: orgId },
    },
  });
  if (!assignment) {
    throw new ForbiddenError(
      'You can only manage timesheets of your direct reports',
      ERROR_CODES.NOT_DIRECT_REPORT
    );
  }
}
