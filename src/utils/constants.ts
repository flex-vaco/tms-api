// Application-wide constants — avoids magic strings throughout the codebase

export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export const PROJECT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export const TIME_FORMAT = {
  DECIMAL: 'decimal',
  HHMM: 'hhmm',
} as const;

export const WORK_WEEK_START = {
  MONDAY: 'monday',
  SUNDAY: 'sunday',
} as const;

export const NOTIFICATION_TYPE = {
  TIMESHEET_DUE: 'timesheet_due',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REMINDER: 'reminder',
} as const;

export const EXPORT_FORMAT = {
  CSV: 'csv',
  EXCEL: 'excel',
  PDF: 'pdf',
} as const;

export const ERROR_CODES = {
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SELF_APPROVAL_FORBIDDEN: 'SELF_APPROVAL_FORBIDDEN',
  IMMUTABLE_TIMESHEET: 'IMMUTABLE_TIMESHEET',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  MAX_HOURS_EXCEEDED: 'MAX_HOURS_EXCEEDED',
  BACKDATING_NOT_ALLOWED: 'BACKDATING_NOT_ALLOWED',
  DESCRIPTION_REQUIRED: 'DESCRIPTION_REQUIRED',
  COPY_WEEK_DISABLED: 'COPY_WEEK_DISABLED',
  NOT_DIRECT_REPORT: 'NOT_DIRECT_REPORT',
  SELF_MANAGER_ASSIGNMENT: 'SELF_MANAGER_ASSIGNMENT',
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Cookie name for refresh token
export const REFRESH_TOKEN_COOKIE = 'refreshToken';

// Pagination defaults
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
