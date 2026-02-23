import { UserRole, TimesheetStatus } from '@prisma/client';

// Extends Express Request with authenticated user payload
declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
    }
  }
}

// Shape of the JWT payload embedded in access tokens
export interface JwtPayload {
  userId: number;
  orgId: number;
  role: UserRole;
}

// Standard API response envelopes
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiPaginated<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: string;
  code: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
}

// Pagination query params after parsing
export interface PaginationQuery {
  page: number;
  limit: number;
}

// ---- Auth DTOs ----
export interface RegisterDto {
  organisationName: string;
  name: string;
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ---- Timesheet DTOs ----
export interface CreateTimesheetDto {
  weekStartDate: string; // ISO date string YYYY-MM-DD
}

export interface UpdateTimesheetDto {
  weekStartDate?: string;
}

// ---- TimeEntry DTOs ----
export interface CreateTimeEntryDto {
  projectId: number;
  description?: string;
  billable?: boolean;
  monHours?: number;
  tueHours?: number;
  wedHours?: number;
  thuHours?: number;
  friHours?: number;
  satHours?: number;
  sunHours?: number;
}

export interface UpdateTimeEntryDto {
  projectId?: number;
  description?: string;
  billable?: boolean;
  monHours?: number;
  tueHours?: number;
  wedHours?: number;
  thuHours?: number;
  friHours?: number;
  satHours?: number;
  sunHours?: number;
}

// ---- Approval DTOs ----
export interface RejectTimesheetDto {
  reason: string;
}

// ---- Report DTOs ----
export interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  userId?: number;
  status?: TimesheetStatus;
  projectId?: number;
}

// ---- Project DTOs ----
export interface CreateProjectDto {
  code: string;
  name: string;
  client: string;
  budgetHours?: number;
  status?: string;
  managerIds?: number[];
  employeeIds?: number[];
}

export interface UpdateProjectDto {
  code?: string;
  name?: string;
  client?: string;
  budgetHours?: number;
  status?: string;
  managerIds?: number[];
  employeeIds?: number[];
}

// ---- User DTOs ----
export interface CreateUserDto {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  department?: string;
  managerIds?: number[];
  projectIds?: number[];
}

export interface UpdateUserDto {
  name?: string;
  role?: UserRole;
  department?: string;
  status?: string;
  managerIds?: number[];
  projectIds?: number[];
}

// ---- Holiday DTOs ----
export interface CreateHolidayDto {
  name: string;
  date: string; // ISO date string
  recurring?: boolean;
}

// ---- Settings DTOs ----
export interface UpdateSettingsDto {
  workWeekStart?: string;
  standardHours?: number;
  timeFormat?: string;
  timeIncrement?: number;
  maxHoursPerDay?: number;
  maxHoursPerWeek?: number;
  requireApproval?: boolean;
  allowBackdated?: boolean;
  enableOvertime?: boolean;
  mandatoryDesc?: boolean;
  allowCopyWeek?: boolean;
  dailyReminderTime?: string;
  weeklyDeadline?: string;
  payrollType?: string;
  pmType?: string;
}
