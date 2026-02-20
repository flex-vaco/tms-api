import { UserRole } from '@prisma/client';
import { prisma } from '../utils/db';
import { ReportFilters } from '../types';
import { ForbiddenError, NotFoundError } from '../types/errors';
import { getDirectReportIds } from './team.service';
import type { MonthlyDayRow, MonthlyTimesheetData } from '../utils/exportHelpers';

export async function generateReport(
  orgId: number,
  filters: ReportFilters,
  requestingUserId: number,
  requestingUserRole: UserRole
) {
  // EMPLOYEE: forced to own data only
  // MANAGER: scoped to self + direct reports
  // ADMIN: sees all
  let userScope: Record<string, unknown> = {};
  if (requestingUserRole === UserRole.EMPLOYEE) {
    if (filters.userId && filters.userId !== requestingUserId) {
      throw new ForbiddenError('Insufficient permissions');
    }
    userScope = { userId: requestingUserId };
  } else if (requestingUserRole === UserRole.MANAGER) {
    const directReportIds = await getDirectReportIds(requestingUserId, orgId);
    const allowedIds = [...directReportIds, requestingUserId];

    if (filters.userId && !allowedIds.includes(filters.userId)) {
      throw new ForbiddenError('You can only view reports for your direct reports');
    }

    userScope = { userId: { in: allowedIds } };
  }

  const where = {
    organisationId: orgId,
    weekStartDate: {
      gte: new Date(filters.dateFrom),
      lte: new Date(filters.dateTo),
    },
    ...(filters.userId ? { userId: filters.userId } : userScope),
    ...(filters.status ? { status: filters.status } : {}),
  };

  const timesheets = await prisma.timesheet.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, department: true } },
      timeEntries: {
        include: {
          project: { select: { id: true, code: true, name: true, client: true } },
        },
        ...(filters.projectId ? { where: { projectId: filters.projectId } } : {}),
      },
    },
    orderBy: { weekStartDate: 'desc' },
  });

  const totalHours = timesheets.reduce((sum, t) => sum + t.totalHours, 0);
  const billableHours = timesheets.reduce((sum, t) => sum + t.billableHours, 0);
  const utilization = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0;

  return {
    timesheets,
    aggregates: {
      totalHours,
      billableHours,
      nonBillableHours: totalHours - billableHours,
      utilization,
      timesheetCount: timesheets.length,
    },
  };
}

const DAY_KEYS = ['monHours', 'tueHours', 'wedHours', 'thuHours', 'friHours', 'satHours', 'sunHours'] as const;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getDayKeyForDate(date: Date, weekStart: Date): typeof DAY_KEYS[number] | null {
  const diff = Math.round((date.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0 || diff > 6) return null;
  // weekStart is Monday (index 0=mon, 1=tue, ... 6=sun)
  return DAY_KEYS[diff];
}

/**
 * Enforces the same permission rules as generateReport, then builds
 * day-by-day data for the monthly timesheet Excel.
 */
export async function generateMonthlyTimesheetData(
  orgId: number,
  targetUserId: number,
  year: number,
  month: number, // 1-based (1=Jan)
  requestingUserId: number,
  requestingUserRole: UserRole
): Promise<MonthlyTimesheetData> {
  // Permission check
  if (requestingUserRole === UserRole.EMPLOYEE) {
    if (targetUserId !== requestingUserId) {
      throw new ForbiddenError('Insufficient permissions');
    }
  } else if (requestingUserRole === UserRole.MANAGER) {
    if (targetUserId !== requestingUserId) {
      const directReportIds = await getDirectReportIds(requestingUserId, orgId);
      if (!directReportIds.includes(targetUserId)) {
        throw new ForbiddenError('You can only view reports for your direct reports');
      }
    }
  }

  // Fetch target user
  const targetUser = await prisma.user.findFirst({
    where: { id: targetUserId, organisationId: orgId },
    select: { id: true, name: true, email: true, department: true },
  });
  if (!targetUser) throw new NotFoundError('User');

  // Month boundaries
  const monthEnd = new Date(year, month, 0); // last day of month
  const daysInMonth = monthEnd.getDate();

  // Fetch all timesheets for this user that overlap the month
  // Widen the range slightly to catch week boundaries
  const searchStart = new Date(year, month - 1, -6); // a week before
  const searchEnd = new Date(year, month, 6);         // a week after

  const timesheets = await prisma.timesheet.findMany({
    where: {
      userId: targetUserId,
      organisationId: orgId,
      weekStartDate: { gte: searchStart, lte: searchEnd },
    },
    include: {
      timeEntries: {
        include: {
          project: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });

  // Fetch holidays for this org
  const holidays = await prisma.holiday.findMany({
    where: { organisationId: orgId },
  });

  // Build a set of holiday dates for the month (key = "YYYY-MM-DD")
  const holidayMap = new Map<string, string>();
  for (const h of holidays) {
    const hDate = new Date(h.date);
    const hKey = `${hDate.getFullYear()}-${String(hDate.getMonth() + 1).padStart(2, '0')}-${String(hDate.getDate()).padStart(2, '0')}`;
    // Recurring holidays: match any year
    if (h.recurring) {
      const recKey = `${year}-${String(hDate.getMonth() + 1).padStart(2, '0')}-${String(hDate.getDate()).padStart(2, '0')}`;
      holidayMap.set(recKey, h.name);
    }
    holidayMap.set(hKey, h.name);
  }

  // For each day of the month, aggregate entries
  const days: MonthlyDayRow[] = [];
  let totalHours = 0;
  let totalOvertime = 0;
  let holidayCount = 0;
  let leaveCount = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isHoliday = holidayMap.has(dateKey);
    const holidayName = holidayMap.get(dateKey);

    // Find which timesheet covers this day
    let dayHours = 0;
    const projectNames: string[] = [];
    const taskDescs: string[] = [];
    let isLeave = false;

    for (const ts of timesheets) {
      const wsDate = new Date(ts.weekStartDate);
      const dayKey = getDayKeyForDate(date, wsDate);
      if (!dayKey) continue;

      for (const entry of ts.timeEntries) {
        const hours = entry[dayKey] as number;
        if (hours > 0) {
          dayHours += hours;
          const pName = entry.project?.name ?? '';
          if (pName && !projectNames.includes(pName)) projectNames.push(pName);
          if (entry.description && !taskDescs.includes(entry.description)) taskDescs.push(entry.description);

          // Detect leave rows by project name/code convention
          const pLower = pName.toLowerCase();
          const codeLower = (entry.project?.code ?? '').toLowerCase();
          if (pLower.includes('leave') || codeLower.includes('leave')) {
            isLeave = true;
          }
        }
      }
    }

    if (isHoliday) holidayCount++;
    if (isLeave) leaveCount++;

    // Overtime: hours beyond 8 on a regular working day
    const regularHours = Math.min(dayHours, 8);
    const overtime = dayHours > 8 ? dayHours - 8 : 0;

    if (!isHoliday && !isLeave && !isWeekend) {
      totalHours += regularHours;
      totalOvertime += overtime;
    }

    days.push({
      date: `${String(d).padStart(2, '0')}-${MONTH_SHORT[month - 1]}`,
      day: DAY_NAMES[dayOfWeek],
      project: projectNames.join(', ') || (isWeekend ? '' : ''),
      task: taskDescs.join(', '),
      time: isHoliday || isLeave ? 0 : regularHours,
      overtime,
      totalTime: isHoliday || isLeave ? 0 : dayHours,
      isHoliday,
      holidayName,
      isLeave,
      isWeekend,
    });
  }

  const shortYear = String(year).slice(2);

  return {
    employeeName: targetUser.name,
    employeeId: targetUser.id,
    department: targetUser.department ?? '',
    month: `${MONTH_SHORT[month - 1]}'${shortYear}`,
    monthFull: `${MONTH_FULL[month - 1]} ${year}`,
    days,
    totalHours,
    totalOvertime,
    holidayCount,
    leaveCount,
  };
}
