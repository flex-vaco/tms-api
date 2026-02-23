import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch';
import * as timesheetsService from '../services/timesheets.service';
import { HTTP_STATUS, DEFAULT_PAGE, DEFAULT_LIMIT } from '../utils/constants';

export const list = tryCatch(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || DEFAULT_PAGE;
  const limit = Math.min(parseInt(req.query.limit as string) || DEFAULT_LIMIT, 100);
  const result = await timesheetsService.listTimesheets(req.user.userId, req.user.orgId, page, limit);
  res.status(HTTP_STATUS.OK).json({ success: true, ...result });
});

export const getOne = tryCatch(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const timesheet = await timesheetsService.getTimesheetById(id, req.user.userId, req.user.orgId);
  res.status(HTTP_STATUS.OK).json({ success: true, data: timesheet });
});

export const create = tryCatch(async (req: Request, res: Response) => {
  const timesheet = await timesheetsService.createTimesheet(req.user.userId, req.user.orgId, req.body);
  res.status(HTTP_STATUS.CREATED).json({ success: true, data: timesheet });
});

export const update = tryCatch(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const timesheet = await timesheetsService.updateTimesheet(id, req.user.userId, req.user.orgId, req.body);
  res.status(HTTP_STATUS.OK).json({ success: true, data: timesheet });
});

export const remove = tryCatch(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await timesheetsService.deleteTimesheet(id, req.user.userId, req.user.orgId);
  res.status(HTTP_STATUS.OK).json({ success: true, data: { message: 'Timesheet deleted' } });
});

export const submit = tryCatch(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const timesheet = await timesheetsService.submitTimesheet(id, req.user.userId, req.user.orgId);
  res.status(HTTP_STATUS.OK).json({ success: true, data: timesheet });
});

export const copyPreviousWeek = tryCatch(async (req: Request, res: Response) => {
  const { targetWeekStart } = req.body as { targetWeekStart: string };
  const timesheet = await timesheetsService.copyPreviousWeek(req.user.userId, req.user.orgId, targetWeekStart, req.user.role);
  res.status(HTTP_STATUS.CREATED).json({ success: true, data: timesheet });
});

// ---- Time Entries ----

export const listEntries = tryCatch(async (req: Request, res: Response) => {
  const timesheetId = parseInt(req.params.id);
  const entries = await timesheetsService.listEntries(timesheetId, req.user.userId, req.user.orgId);
  res.status(HTTP_STATUS.OK).json({ success: true, data: entries });
});

export const createEntry = tryCatch(async (req: Request, res: Response) => {
  const timesheetId = parseInt(req.params.id);
  const entry = await timesheetsService.createEntry(timesheetId, req.user.userId, req.user.orgId, req.body, req.user.role);
  res.status(HTTP_STATUS.CREATED).json({ success: true, data: entry });
});

export const updateEntry = tryCatch(async (req: Request, res: Response) => {
  const timesheetId = parseInt(req.params.id);
  const entryId = parseInt(req.params.eid);
  const entry = await timesheetsService.updateEntry(timesheetId, entryId, req.user.userId, req.user.orgId, req.body, req.user.role);
  res.status(HTTP_STATUS.OK).json({ success: true, data: entry });
});

export const deleteEntry = tryCatch(async (req: Request, res: Response) => {
  const timesheetId = parseInt(req.params.id);
  const entryId = parseInt(req.params.eid);
  await timesheetsService.deleteEntry(timesheetId, entryId, req.user.userId, req.user.orgId);
  res.status(HTTP_STATUS.OK).json({ success: true, data: { message: 'Entry deleted' } });
});
