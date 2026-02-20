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
