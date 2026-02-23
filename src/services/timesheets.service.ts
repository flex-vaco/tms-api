import { TimesheetStatus, UserRole } from '@prisma/client';
import { prisma } from '../utils/db';
import { CreateTimesheetDto } from '../types';
import {
  NotFoundError,
  ConflictError,
  ImmutableTimesheetError,
  InvalidTransitionError,
  ValidationError,
} from '../types/errors';
import { AppError } from '../types/errors';
import { getWeekStart, getWeekEnd, isInPast } from '../utils/dateHelpers';
import { ERROR_CODES, DEFAULT_PAGE, DEFAULT_LIMIT } from '../utils/constants';
import { getAssignedProjectIds } from './team.service';

// Recalculates and persists totalHours + billableHours on a timesheet from its entries
async function recalculateTimesheetTotals(timesheetId: number): Promise<void> {
  const entries = await prisma.timeEntry.findMany({ where: { timesheetId } });
  const totalHours = entries.reduce((sum, e) => sum + e.totalHours, 0);
  const billableHours = entries
    .filter((e) => e.billable)
    .reduce((sum, e) => sum + e.totalHours, 0);

  await prisma.timesheet.update({
    where: { id: timesheetId },
    data: { totalHours, billableHours },
  });
}

export async function listTimesheets(userId: number, orgId: number, page = DEFAULT_PAGE, limit = DEFAULT_LIMIT) {
  const skip = (page - 1) * limit;
  const [data, total] = await prisma.$transaction([
    prisma.timesheet.findMany({
      where: { userId, organisationId: orgId },
      orderBy: { weekStartDate: 'desc' },
      skip,
      take: limit,
      include: { timeEntries: false },
    }),
    prisma.timesheet.count({ where: { userId, organisationId: orgId } }),
  ]);
  return { data, meta: { total, page, limit } };
}

export async function getTimesheetById(id: number, userId: number, orgId: number) {
  const timesheet = await prisma.timesheet.findFirst({
    where: { id, userId, organisationId: orgId },
    include: {
      timeEntries: {
        include: { project: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!timesheet) throw new NotFoundError('Timesheet');
  return timesheet;
}

export async function createTimesheet(userId: number, orgId: number, dto: CreateTimesheetDto) {
  const settings = await prisma.orgSettings.findUnique({ where: { organisationId: orgId } });
  const startDay = (settings?.workWeekStart ?? 'monday') as 'monday' | 'sunday';

  const inputDate = new Date(dto.weekStartDate);
  const weekStartDate = getWeekStart(inputDate, startDay);
  const weekEndDate = getWeekEnd(weekStartDate, startDay);

  // Enforce backdating policy
  if (!settings?.allowBackdated && isInPast(weekStartDate)) {
    throw new AppError(
      'Backdated timesheets are not allowed',
      400,
      ERROR_CODES.BACKDATING_NOT_ALLOWED
    );
  }

  // Enforce one-timesheet-per-user-per-week rule
  const existing = await prisma.timesheet.findFirst({
    where: {
      userId,
      organisationId: orgId,
      weekStartDate,
    },
  });
  if (existing) {
    throw new ConflictError('A timesheet already exists for this week');
  }

  return prisma.timesheet.create({
    data: {
      userId,
      organisationId: orgId,
      weekStartDate,
      weekEndDate,
      status: TimesheetStatus.DRAFT,
    },
  });
}

export async function updateTimesheet(id: number, userId: number, orgId: number, dto: Partial<CreateTimesheetDto>) {
  const timesheet = await prisma.timesheet.findFirst({ where: { id, userId, organisationId: orgId } });
  if (!timesheet) throw new NotFoundError('Timesheet');
  if (timesheet.status !== TimesheetStatus.DRAFT) throw new ImmutableTimesheetError();

  return prisma.timesheet.update({
    where: { id },
    data: { ...(dto.weekStartDate ? { weekStartDate: new Date(dto.weekStartDate) } : {}) },
  });
}

export async function deleteTimesheet(id: number, userId: number, orgId: number): Promise<void> {
  const timesheet = await prisma.timesheet.findFirst({ where: { id, userId, organisationId: orgId } });
  if (!timesheet) throw new NotFoundError('Timesheet');
  if (timesheet.status !== TimesheetStatus.DRAFT) throw new ImmutableTimesheetError();

  await prisma.timesheet.delete({ where: { id } });
}

export async function submitTimesheet(id: number, userId: number, orgId: number) {
  const timesheet = await prisma.timesheet.findFirst({ where: { id, userId, organisationId: orgId } });
  if (!timesheet) throw new NotFoundError('Timesheet');

  const allowedFrom: TimesheetStatus[] = [TimesheetStatus.DRAFT, TimesheetStatus.REJECTED];
  if (!allowedFrom.includes(timesheet.status)) {
    throw new InvalidTransitionError(timesheet.status, TimesheetStatus.SUBMITTED);
  }

  return prisma.timesheet.update({
    where: { id },
    data: { status: TimesheetStatus.SUBMITTED },
  });
}

export async function copyPreviousWeek(userId: number, orgId: number, targetWeekStart: string, userRole: UserRole) {
  const settings = await prisma.orgSettings.findUnique({ where: { organisationId: orgId } });
  if (!settings?.allowCopyWeek) {
    throw new AppError('Copy Previous Week feature is disabled', 400, ERROR_CODES.COPY_WEEK_DISABLED);
  }

  // Find the most recent approved or submitted timesheet for this user
  const previous = await prisma.timesheet.findFirst({
    where: {
      userId,
      organisationId: orgId,
      status: { in: [TimesheetStatus.APPROVED, TimesheetStatus.SUBMITTED] },
    },
    orderBy: { weekStartDate: 'desc' },
    include: { timeEntries: true },
  });

  if (!previous) throw new NotFoundError('Previous submitted or approved timesheet');

  const startDay = (settings.workWeekStart ?? 'monday') as 'monday' | 'sunday';
  const inputDate = new Date(targetWeekStart);
  const weekStartDate = getWeekStart(inputDate, startDay);
  const weekEndDate = getWeekEnd(weekStartDate, startDay);

  // Ensure no existing timesheet for the target week
  const existing = await prisma.timesheet.findFirst({
    where: { userId, organisationId: orgId, weekStartDate },
  });
  if (existing) throw new ConflictError('A timesheet already exists for the target week');

  // For EMPLOYEE, filter out entries for projects they are no longer assigned to
  let entriesToCopy = previous.timeEntries;
  let skippedCount = 0;
  if (userRole === UserRole.EMPLOYEE) {
    const assignedIds = await getAssignedProjectIds(userId, orgId);
    const assignedSet = new Set(assignedIds);
    const filtered = entriesToCopy.filter((e) => assignedSet.has(e.projectId));
    skippedCount = entriesToCopy.length - filtered.length;
    entriesToCopy = filtered;
  }

  // Create new draft + copy entry rows (no hours — per spec)
  const newTimesheet = await prisma.$transaction(async (tx) => {
    const ts = await tx.timesheet.create({
      data: { userId, organisationId: orgId, weekStartDate, weekEndDate, status: TimesheetStatus.DRAFT },
    });

    if (entriesToCopy.length > 0) {
      await tx.timeEntry.createMany({
        data: entriesToCopy.map((e) => ({
          timesheetId: ts.id,
          projectId: e.projectId,
          description: e.description,
          billable: e.billable,
          // Hours intentionally not copied per business rule #6
        })),
      });
    }
    return ts;
  });

  return { ...newTimesheet, skippedCount };
}

// ---- Time Entry operations ----

export async function listEntries(timesheetId: number, userId: number, orgId: number) {
  // Verify ownership before returning entries
  const timesheet = await prisma.timesheet.findFirst({ where: { id: timesheetId, userId, organisationId: orgId } });
  if (!timesheet) throw new NotFoundError('Timesheet');

  return prisma.timeEntry.findMany({
    where: { timesheetId },
    include: { project: true },
    orderBy: { createdAt: 'asc' },
  });
}

function calcEntryTotal(data: {
  monHours?: number; tueHours?: number; wedHours?: number; thuHours?: number;
  friHours?: number; satHours?: number; sunHours?: number;
}): number {
  return (
    (data.monHours ?? 0) + (data.tueHours ?? 0) + (data.wedHours ?? 0) +
    (data.thuHours ?? 0) + (data.friHours ?? 0) + (data.satHours ?? 0) +
    (data.sunHours ?? 0)
  );
}

export async function createEntry(
  timesheetId: number, userId: number, orgId: number,
  dto: {
    projectId: number; description?: string; billable?: boolean;
    monHours?: number; tueHours?: number; wedHours?: number; thuHours?: number;
    friHours?: number; satHours?: number; sunHours?: number;
  },
  userRole: UserRole
) {
  const timesheet = await prisma.timesheet.findFirst({ where: { id: timesheetId, userId, organisationId: orgId } });
  if (!timesheet) throw new NotFoundError('Timesheet');
  if (timesheet.status !== TimesheetStatus.DRAFT && timesheet.status !== TimesheetStatus.REJECTED) {
    throw new ImmutableTimesheetError();
  }

  const settings = await prisma.orgSettings.findUnique({ where: { organisationId: orgId } });

  // Mandatory description check
  if (settings?.mandatoryDesc && !dto.description?.trim()) {
    throw new AppError('Description is required', 400, ERROR_CODES.DESCRIPTION_REQUIRED);
  }

  // Verify project belongs to org
  const project = await prisma.project.findFirst({ where: { id: dto.projectId, organisationId: orgId } });
  if (!project) throw new NotFoundError('Project');

  // EMPLOYEE: verify project is assigned to this employee
  if (userRole === UserRole.EMPLOYEE) {
    const assignment = await prisma.projectEmployee.findFirst({
      where: { projectId: dto.projectId, employeeId: userId },
    });
    if (!assignment) {
      throw new AppError('You are not assigned to this project', 403, ERROR_CODES.EMPLOYEE_NOT_ASSIGNED);
    }
  }

  const totalHours = calcEntryTotal(dto);

  // Max hours per day validation
  const dayColumns = [
    dto.monHours, dto.tueHours, dto.wedHours, dto.thuHours,
    dto.friHours, dto.satHours, dto.sunHours,
  ];
  const maxPerDay = settings?.maxHoursPerDay ?? 24;
  for (const hours of dayColumns) {
    if (hours !== undefined && hours > maxPerDay) {
      throw new AppError(`Cannot log more than ${maxPerDay} hours per day`, 400, ERROR_CODES.MAX_HOURS_EXCEEDED);
    }
  }

  const entry = await prisma.timeEntry.create({
    data: { timesheetId, projectId: dto.projectId, description: dto.description, billable: dto.billable ?? true, ...dto, totalHours },
    include: { project: true },
  });

  await recalculateTimesheetTotals(timesheetId);
  return entry;
}

export async function updateEntry(
  timesheetId: number, entryId: number, userId: number, orgId: number,
  dto: Partial<{ projectId: number; description: string; billable: boolean;
    monHours: number; tueHours: number; wedHours: number; thuHours: number;
    friHours: number; satHours: number; sunHours: number; }>,
  userRole: UserRole
) {
  const timesheet = await prisma.timesheet.findFirst({ where: { id: timesheetId, userId, organisationId: orgId } });
  if (!timesheet) throw new NotFoundError('Timesheet');
  if (timesheet.status !== TimesheetStatus.DRAFT && timesheet.status !== TimesheetStatus.REJECTED) {
    throw new ImmutableTimesheetError();
  }

  const entry = await prisma.timeEntry.findFirst({ where: { id: entryId, timesheetId } });
  if (!entry) throw new NotFoundError('TimeEntry');

  // EMPLOYEE: if changing project, verify the new project is assigned
  if (dto.projectId !== undefined && userRole === UserRole.EMPLOYEE) {
    const assignment = await prisma.projectEmployee.findFirst({
      where: { projectId: dto.projectId, employeeId: userId },
    });
    if (!assignment) {
      throw new AppError('You are not assigned to this project', 403, ERROR_CODES.EMPLOYEE_NOT_ASSIGNED);
    }
  }

  const merged = {
    monHours: dto.monHours ?? entry.monHours,
    tueHours: dto.tueHours ?? entry.tueHours,
    wedHours: dto.wedHours ?? entry.wedHours,
    thuHours: dto.thuHours ?? entry.thuHours,
    friHours: dto.friHours ?? entry.friHours,
    satHours: dto.satHours ?? entry.satHours,
    sunHours: dto.sunHours ?? entry.sunHours,
  };
  const totalHours = calcEntryTotal(merged);

  const updated = await prisma.timeEntry.update({
    where: { id: entryId },
    data: { ...dto, ...merged, totalHours },
    include: { project: true },
  });

  await recalculateTimesheetTotals(timesheetId);
  return updated;
}

export async function deleteEntry(timesheetId: number, entryId: number, userId: number, orgId: number): Promise<void> {
  const timesheet = await prisma.timesheet.findFirst({ where: { id: timesheetId, userId, organisationId: orgId } });
  if (!timesheet) throw new NotFoundError('Timesheet');
  if (timesheet.status !== TimesheetStatus.DRAFT && timesheet.status !== TimesheetStatus.REJECTED) {
    throw new ImmutableTimesheetError();
  }

  const entry = await prisma.timeEntry.findFirst({ where: { id: entryId, timesheetId } });
  if (!entry) throw new NotFoundError('TimeEntry');

  await prisma.timeEntry.delete({ where: { id: entryId } });
  await recalculateTimesheetTotals(timesheetId);
}
