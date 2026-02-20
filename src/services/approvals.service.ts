import { TimesheetStatus, UserRole } from '@prisma/client';
import { prisma } from '../utils/db';
import { NotFoundError, ForbiddenError, InvalidTransitionError } from '../types/errors';
import { ERROR_CODES, DEFAULT_PAGE, DEFAULT_LIMIT } from '../utils/constants';
import { getDirectReportIds, assertIsDirectReport } from './team.service';

/**
 * Builds a userId filter that scopes queries to direct reports for MANAGER,
 * or returns no filter for ADMIN (org-wide visibility).
 */
async function buildTeamFilter(userId: number, userRole: UserRole, orgId: number) {
  if (userRole === UserRole.ADMIN) return {};
  const directReportIds = await getDirectReportIds(userId, orgId);
  return { userId: { in: directReportIds } };
}

export async function listPendingApprovals(
  orgId: number,
  userId: number,
  userRole: UserRole,
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT
) {
  const teamFilter = await buildTeamFilter(userId, userRole, orgId);
  const skip = (page - 1) * limit;
  const where = { organisationId: orgId, status: TimesheetStatus.SUBMITTED, ...teamFilter };

  const [data, total] = await prisma.$transaction([
    prisma.timesheet.findMany({
      where,
      orderBy: { updatedAt: 'asc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true, department: true } },
        timeEntries: { include: { project: true } },
      },
    }),
    prisma.timesheet.count({ where }),
  ]);
  return { data, meta: { total, page, limit } };
}

export async function getApprovalStats(orgId: number, userId: number, userRole: UserRole) {
  const teamFilter = await buildTeamFilter(userId, userRole, orgId);
  const now = new Date();
  // Compute start of current week (Monday)
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);

  const [pending, approvedThisWeek, teamEntries, teamMembers] = await prisma.$transaction([
    prisma.timesheet.count({ where: { organisationId: orgId, status: TimesheetStatus.SUBMITTED, ...teamFilter } }),
    prisma.timesheet.count({
      where: {
        organisationId: orgId,
        status: TimesheetStatus.APPROVED,
        approvedAt: { gte: weekStart },
        ...teamFilter,
      },
    }),
    prisma.timesheet.aggregate({
      where: { organisationId: orgId, status: { in: [TimesheetStatus.SUBMITTED, TimesheetStatus.APPROVED] }, ...teamFilter },
      _sum: { totalHours: true },
    }),
    userRole === UserRole.ADMIN
      ? prisma.user.count({ where: { organisationId: orgId, status: 'active' } })
      : prisma.managerEmployee.count({ where: { managerId: userId, manager: { organisationId: orgId } } }),
  ]);

  return {
    pending,
    approvedThisWeek,
    teamHours: teamEntries._sum.totalHours ?? 0,
    teamMembers,
  };
}

export async function approveTimesheet(
  timesheetId: number,
  approvingUserId: number,
  orgId: number,
  userRole: UserRole
) {
  const timesheet = await prisma.timesheet.findFirst({
    where: { id: timesheetId, organisationId: orgId },
  });
  if (!timesheet) throw new NotFoundError('Timesheet');

  // Self-approval guard — managers cannot approve their own timesheets
  if (timesheet.userId === approvingUserId) {
    throw new ForbiddenError(
      'Managers cannot approve their own timesheets',
      ERROR_CODES.SELF_APPROVAL_FORBIDDEN
    );
  }

  // Direct-report guard — managers can only approve their direct reports
  if (userRole === UserRole.MANAGER) {
    await assertIsDirectReport(approvingUserId, timesheet.userId, orgId);
  }

  if (timesheet.status !== TimesheetStatus.SUBMITTED) {
    throw new InvalidTransitionError(timesheet.status, TimesheetStatus.APPROVED);
  }

  const approved = await prisma.timesheet.update({
    where: { id: timesheetId },
    data: {
      status: TimesheetStatus.APPROVED,
      approvedById: approvingUserId,
      approvedAt: new Date(),
    },
  });

  // Update project usedHours for all entries in this timesheet
  const entries = await prisma.timeEntry.findMany({ where: { timesheetId } });
  for (const entry of entries) {
    await prisma.project.update({
      where: { id: entry.projectId },
      data: { usedHours: { increment: entry.totalHours } },
    });
  }

  // Notify the timesheet owner
  await prisma.notification.create({
    data: {
      userId: timesheet.userId,
      type: 'approved',
      message: `Your timesheet for week starting ${timesheet.weekStartDate.toISOString().split('T')[0]} has been approved.`,
    },
  });

  return approved;
}

export async function rejectTimesheet(
  timesheetId: number,
  approvingUserId: number,
  orgId: number,
  reason: string,
  userRole: UserRole
) {
  const timesheet = await prisma.timesheet.findFirst({
    where: { id: timesheetId, organisationId: orgId },
  });
  if (!timesheet) throw new NotFoundError('Timesheet');

  if (timesheet.userId === approvingUserId) {
    throw new ForbiddenError(
      'Managers cannot reject their own timesheets',
      ERROR_CODES.SELF_APPROVAL_FORBIDDEN
    );
  }

  // Direct-report guard — managers can only reject their direct reports
  if (userRole === UserRole.MANAGER) {
    await assertIsDirectReport(approvingUserId, timesheet.userId, orgId);
  }

  if (timesheet.status !== TimesheetStatus.SUBMITTED) {
    throw new InvalidTransitionError(timesheet.status, TimesheetStatus.REJECTED);
  }

  const rejected = await prisma.timesheet.update({
    where: { id: timesheetId },
    data: {
      status: TimesheetStatus.REJECTED,
      rejectedReason: reason,
    },
  });

  await prisma.notification.create({
    data: {
      userId: timesheet.userId,
      type: 'rejected',
      message: `Your timesheet for week starting ${timesheet.weekStartDate.toISOString().split('T')[0]} was rejected. Reason: ${reason}`,
    },
  });

  return rejected;
}
