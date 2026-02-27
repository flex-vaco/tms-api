import { z } from 'zod';
import { UserRole } from '@prisma/client';

// ---- Helpers ----
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a valid date in YYYY-MM-DD format');

const hourValue = z.number().min(0).max(24);

// ---- Auth ----
export const registerSchema = z.object({
  organisationName: z.string().min(1, 'Organisation name is required'),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Must be a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

// ---- Timesheets ----
export const createTimesheetSchema = z.object({
  weekStartDate: isoDate,
});

export const updateTimesheetSchema = z
  .object({
    weekStartDate: isoDate.optional(),
  })
  .strict();

// ---- Time Entries ----
export const createTimeEntrySchema = z.object({
  projectId: z.number({ required_error: 'projectId is required' }).int().positive(),
  billable: z.boolean().optional(),
  monHours: hourValue.optional(),
  monDesc: z.string().optional(),
  tueHours: hourValue.optional(),
  tueDesc: z.string().optional(),
  wedHours: hourValue.optional(),
  wedDesc: z.string().optional(),
  thuHours: hourValue.optional(),
  thuDesc: z.string().optional(),
  friHours: hourValue.optional(),
  friDesc: z.string().optional(),
  satHours: hourValue.optional(),
  satDesc: z.string().optional(),
  sunHours: hourValue.optional(),
  sunDesc: z.string().optional(),
});

export const updateTimeEntrySchema = z
  .object({
    projectId: z.number().int().positive().optional(),
    billable: z.boolean().optional(),
    monHours: hourValue.optional(),
    monDesc: z.string().optional(),
    tueHours: hourValue.optional(),
    tueDesc: z.string().optional(),
    wedHours: hourValue.optional(),
    wedDesc: z.string().optional(),
    thuHours: hourValue.optional(),
    thuDesc: z.string().optional(),
    friHours: hourValue.optional(),
    friDesc: z.string().optional(),
    satHours: hourValue.optional(),
    satDesc: z.string().optional(),
    sunHours: hourValue.optional(),
    sunDesc: z.string().optional(),
  })
  .strict();

// ---- Approvals ----
export const rejectTimesheetSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});

// ---- Projects ----
export const createProjectSchema = z.object({
  code: z.string().min(1, 'Project code is required'),
  name: z.string().min(1, 'Project name is required'),
  client: z.string().min(1, 'Client is required'),
  budgetHours: z.number().min(0).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  managerIds: z.array(z.number().int().positive()).optional(),
  employeeIds: z.array(z.number().int().positive()).optional(),
});

export const updateProjectSchema = z
  .object({
    code: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    client: z.string().min(1).optional(),
    budgetHours: z.number().min(0).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    managerIds: z.array(z.number().int().positive()).optional(),
    employeeIds: z.array(z.number().int().positive()).optional(),
  })
  .strict();

// ---- Users ----
export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Must be a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.nativeEnum(UserRole).optional(),
  department: z.string().optional(),
  managerIds: z.array(z.number().int().positive()).optional(),
  projectIds: z.array(z.number().int().positive()).optional(),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    role: z.nativeEnum(UserRole).optional(),
    department: z.string().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    managerIds: z.array(z.number().int().positive()).optional(),
    projectIds: z.array(z.number().int().positive()).optional(),
  })
  .strict();

// ---- Holidays ----
export const createHolidaySchema = z.object({
  name: z.string().min(1, 'Holiday name is required'),
  date: isoDate,
  recurring: z.boolean().optional(),
});

// ---- Settings ----
export const updateSettingsSchema = z
  .object({
    workWeekStart: z.enum(['monday', 'sunday']).optional(),
    standardHours: z.number().min(0).max(24).optional(),
    timeFormat: z.enum(['decimal', 'hhmm']).optional(),
    timeIncrement: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(),
    maxHoursPerDay: z.number().min(0).max(24).optional(),
    maxHoursPerWeek: z.number().min(0).max(168).optional(),
    requireApproval: z.boolean().optional(),
    allowBackdated: z.boolean().optional(),
    enableOvertime: z.boolean().optional(),
    mandatoryDesc: z.boolean().optional(),
    allowCopyWeek: z.boolean().optional(),
    dailyReminderTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format')
      .optional(),
    weeklyDeadline: z
      .enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
      .optional(),
    payrollType: z.string().optional(),
    pmType: z.string().optional(),
  })
  .strict();

// ---- Team ----
export const setUserManagersSchema = z.object({
  managerIds: z.array(z.number().int().positive(), {
    required_error: 'managerIds array is required',
  }),
});
