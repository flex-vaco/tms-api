import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { prisma } from '../utils/db';
import { CreateUserDto, UpdateUserDto } from '../types';
import { NotFoundError, ConflictError, ForbiddenError } from '../types/errors';
import { DEFAULT_PAGE, DEFAULT_LIMIT, ERROR_CODES } from '../utils/constants';
import { assignManagers, removeAllManagedEmployees, getDirectReportIds } from './team.service';

const BCRYPT_ROUNDS = 12;

const USER_SELECT = {
  id: true, name: true, email: true, role: true,
  department: true, status: true, createdAt: true, updatedAt: true,
  managers: {
    select: {
      manager: { select: { id: true, name: true } },
    },
  },
} as const;

export async function listUsers(
  orgId: number,
  requestingUserId: number,
  requestingRole: UserRole,
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT
) {
  const skip = (page - 1) * limit;

  // MANAGER sees only their direct reports; ADMIN sees all org users
  let userFilter: Record<string, unknown> = { organisationId: orgId };
  if (requestingRole === UserRole.MANAGER) {
    const directReportIds = await getDirectReportIds(requestingUserId, orgId);
    userFilter = { organisationId: orgId, id: { in: directReportIds } };
  }

  const [data, total] = await prisma.$transaction([
    prisma.user.findMany({
      where: userFilter,
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count({ where: userFilter }),
  ]);
  return { data, meta: { total, page, limit } };
}

/**
 * Ensures a MANAGER can only operate on their direct reports.
 * ADMINs bypass this check.
 */
async function assertCanManageUser(
  requestingUserId: number,
  requestingRole: UserRole,
  targetUserId: number,
  orgId: number
): Promise<void> {
  if (requestingRole === UserRole.ADMIN) return;
  const directReportIds = await getDirectReportIds(requestingUserId, orgId);
  if (!directReportIds.includes(targetUserId)) {
    throw new ForbiddenError(
      'You can only manage your direct reports',
      ERROR_CODES.NOT_DIRECT_REPORT
    );
  }
}

export async function createUser(
  orgId: number,
  dto: CreateUserDto,
  requestingUserId: number,
  requestingRole: UserRole
) {
  // Managers can only create EMPLOYEEs, not other MANAGERs or ADMINs
  if (requestingRole === UserRole.MANAGER && dto.role && dto.role !== UserRole.EMPLOYEE) {
    throw new ForbiddenError('Managers can only create employees');
  }

  const existing = await prisma.user.findUnique({ where: { email: dto.email } });
  if (existing) throw new ConflictError('Email address is already in use');

  const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      organisationId: orgId,
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: dto.role ?? UserRole.EMPLOYEE,
      department: dto.department,
    },
    select: {
      id: true, name: true, email: true, role: true,
      department: true, status: true, createdAt: true,
    },
  });

  // For a MANAGER creating an employee, auto-assign themselves as the manager
  if (requestingRole === UserRole.MANAGER) {
    const managerIds = dto.managerIds?.length ? dto.managerIds : [requestingUserId];
    await assignManagers(user.id, managerIds, orgId);
  } else if (dto.managerIds?.length) {
    await assignManagers(user.id, dto.managerIds, orgId);
  }

  return user;
}

export async function updateUser(
  id: number,
  orgId: number,
  dto: UpdateUserDto,
  requestingUserId: number,
  requestingRole: UserRole
) {
  const user = await prisma.user.findFirst({ where: { id, organisationId: orgId } });
  if (!user) throw new NotFoundError('User');

  await assertCanManageUser(requestingUserId, requestingRole, id, orgId);

  // Managers cannot change a user's role to MANAGER or ADMIN
  if (requestingRole === UserRole.MANAGER && dto.role && dto.role !== UserRole.EMPLOYEE) {
    throw new ForbiddenError('Managers can only assign the Employee role');
  }

  const { managerIds, ...updateData } = dto;

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true, name: true, email: true, role: true,
      department: true, status: true, updatedAt: true,
    },
  });

  // If role changed away from MANAGER/ADMIN, remove all managed employees
  const newRole = dto.role ?? user.role;
  if (newRole === UserRole.EMPLOYEE && user.role !== UserRole.EMPLOYEE) {
    await removeAllManagedEmployees(id);
  }

  // Update manager assignments if provided
  if (managerIds !== undefined) {
    await assignManagers(id, managerIds, orgId);
  }

  return updated;
}

export async function deactivateUser(
  id: number,
  orgId: number,
  requestingUserId: number,
  requestingRole: UserRole
): Promise<void> {
  const user = await prisma.user.findFirst({ where: { id, organisationId: orgId } });
  if (!user) throw new NotFoundError('User');

  await assertCanManageUser(requestingUserId, requestingRole, id, orgId);

  // Soft delete — set status to inactive rather than removing the record
  await prisma.user.update({ where: { id }, data: { status: 'inactive', refreshToken: null } });
}
