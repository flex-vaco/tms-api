import { TimesheetStatus, UserRole } from '@prisma/client';
import { prisma } from '../utils/db';
import { CreateTimesheetDto } from '../types';
import {
  AppError,
  NotFoundError,
  ConflictError,
  ImmutableTimesheetError,
  InvalidTransitionError,
} from '../types/errors';
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

export async function copyPreviousWeek(userId: number, orgId: number, targetWeekStart: string, userRole: UserRole, force = false) {
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

  const existing = await prisma.timesheet.findFirst({
    where: { userId, organisationId: orgId, weekStartDate },
  });

  if (existing && !force) {
    throw new ConflictError('A timesheet already exists for the target week');
  }

  // Only DRAFT timesheets may be overwritten
  if (existing && force && existing.status !== TimesheetStatus.DRAFT) {
    throw new AppError(
      `Cannot overwrite a ${existing.status.toLowerCase()} timesheet`,
      403,
      ERROR_CODES.IMMUTABLE_TIMESHEET
    );
  }

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

  const entryData = entriesToCopy.map((e) => ({
    projectId: e.projectId,
    billable: e.billable,
    monHours: e.monHours, monDesc: (e as Record<string, unknown>).monDesc as string | null ?? null,
    tueHours: e.tueHours, tueDesc: (e as Record<string, unknown>).tueDesc as string | null ?? null,
    wedHours: e.wedHours, wedDesc: (e as Record<string, unknown>).wedDesc as string | null ?? null,
    thuHours: e.thuHours, thuDesc: (e as Record<string, unknown>).thuDesc as string | null ?? null,
    friHours: e.friHours, friDesc: (e as Record<string, unknown>).friDesc as string | null ?? null,
    satHours: e.satHours, satDesc: (e as Record<string, unknown>).satDesc as string | null ?? null,
    sunHours: e.sunHours, sunDesc: (e as Record<string, unknown>).sunDesc as string | null ?? null,
    totalHours: e.totalHours,
  }));

  const copiedTotalHours = entryData.reduce((sum, e) => sum + e.totalHours, 0);
  const copiedBillableHours = entryData
    .filter((e) => e.billable)
    .reduce((sum, e) => sum + e.totalHours, 0);

  if (existing && force) {
    // Overwrite: replace all entries in the existing DRAFT timesheet and recalculate totals
    const updated = await prisma.$transaction(async (tx) => {
      await tx.timeEntry.deleteMany({ where: { timesheetId: existing.id } });
      if (entryData.length > 0) {
        await tx.timeEntry.createMany({
          data: entryData.map((e) => ({ ...e, timesheetId: existing.id })),
        });
      }
      return tx.timesheet.update({
        where: { id: existing.id },
        data: { totalHours: copiedTotalHours, billableHours: copiedBillableHours },
      });
    });
    return { ...updated, skippedCount };
  }

  // Create new draft + copy entry rows with hours
  const newTimesheet = await prisma.$transaction(async (tx) => {
    const ts = await tx.timesheet.create({
      data: {
        userId,
        organisationId: orgId,
        weekStartDate,
        weekEndDate,
        status: TimesheetStatus.DRAFT,
        totalHours: copiedTotalHours,
        billableHours: copiedBillableHours,
      },
    });
    if (entryData.length > 0) {
      await tx.timeEntry.createMany({
        data: entryData.map((e) => ({ ...e, timesheetId: ts.id })),
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
    projectId: number; billable?: boolean;
    monHours?: number; monDesc?: string;
    tueHours?: number; tueDesc?: string;
    wedHours?: number; wedDesc?: string;
    thuHours?: number; thuDesc?: string;
    friHours?: number; friDesc?: string;
    satHours?: number; satDesc?: string;
    sunHours?: number; sunDesc?: string;
  },
  userRole: UserRole
) {
  const timesheet = await prisma.timesheet.findFirst({ where: { id: timesheetId, userId, organisationId: orgId } });
  if (!timesheet) throw new NotFoundError('Timesheet');
  if (timesheet.status !== TimesheetStatus.DRAFT && timesheet.status !== TimesheetStatus.REJECTED) {
    throw new ImmutableTimesheetError();
  }

  const settings = await prisma.orgSettings.findUnique({ where: { organisationId: orgId } });

  // Mandatory description check — every day that has hours logged must also have a description
  if (settings?.mandatoryDesc) {
    const dayPairs = [
      { hours: dto.monHours, desc: dto.monDesc },
      { hours: dto.tueHours, desc: dto.tueDesc },
      { hours: dto.wedHours, desc: dto.wedDesc },
      { hours: dto.thuHours, desc: dto.thuDesc },
      { hours: dto.friHours, desc: dto.friDesc },
      { hours: dto.satHours, desc: dto.satDesc },
      { hours: dto.sunHours, desc: dto.sunDesc },
    ];
    if (dayPairs.some(({ hours, desc }) => (hours ?? 0) > 0 && !desc?.trim())) {
      throw new AppError('Description is required for each day with logged hours', 400, ERROR_CODES.DESCRIPTION_REQUIRED);
    }
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
    data: {
      timesheetId,
      projectId: dto.projectId,
      billable: dto.billable ?? true,
      monHours: dto.monHours, monDesc: dto.monDesc,
      tueHours: dto.tueHours, tueDesc: dto.tueDesc,
      wedHours: dto.wedHours, wedDesc: dto.wedDesc,
      thuHours: dto.thuHours, thuDesc: dto.thuDesc,
      friHours: dto.friHours, friDesc: dto.friDesc,
      satHours: dto.satHours, satDesc: dto.satDesc,
      sunHours: dto.sunHours, sunDesc: dto.sunDesc,
      totalHours,
    },
    include: { project: true },
  });

  await recalculateTimesheetTotals(timesheetId);
  return entry;
}

export async function updateEntry(
  timesheetId: number, entryId: number, userId: number, orgId: number,
  dto: Partial<{
    projectId: number; billable: boolean;
    monHours: number; monDesc: string;
    tueHours: number; tueDesc: string;
    wedHours: number; wedDesc: string;
    thuHours: number; thuDesc: string;
    friHours: number; friDesc: string;
    satHours: number; satDesc: string;
    sunHours: number; sunDesc: string;
  }>,
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
    monDesc:  'monDesc' in dto ? dto.monDesc : entry.monDesc,
    tueHours: dto.tueHours ?? entry.tueHours,
    tueDesc:  'tueDesc' in dto ? dto.tueDesc : entry.tueDesc,
    wedHours: dto.wedHours ?? entry.wedHours,
    wedDesc:  'wedDesc' in dto ? dto.wedDesc : entry.wedDesc,
    thuHours: dto.thuHours ?? entry.thuHours,
    thuDesc:  'thuDesc' in dto ? dto.thuDesc : entry.thuDesc,
    friHours: dto.friHours ?? entry.friHours,
    friDesc:  'friDesc' in dto ? dto.friDesc : entry.friDesc,
    satHours: dto.satHours ?? entry.satHours,
    satDesc:  'satDesc' in dto ? dto.satDesc : entry.satDesc,
    sunHours: dto.sunHours ?? entry.sunHours,
    sunDesc:  'sunDesc' in dto ? dto.sunDesc : entry.sunDesc,
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
