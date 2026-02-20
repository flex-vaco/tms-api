import { Request, Response } from 'express';
import { TimesheetStatus } from '@prisma/client';
import { tryCatch } from '../utils/tryCatch';
import * as reportsService from '../services/reports.service';
import { HTTP_STATUS } from '../utils/constants';
import { ValidationError } from '../types/errors';
import { generateCSV, generateExcel, generatePDF, generateMonthlyTimesheetExcel } from '../utils/exportHelpers';

export const generate = tryCatch(async (req: Request, res: Response) => {
  const { dateFrom, dateTo, userId, status, projectId } = req.query;

  if (!dateFrom || !dateTo) {
    throw new ValidationError('dateFrom and dateTo are required query parameters');
  }

  const data = await reportsService.generateReport(
    req.user.orgId,
    {
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      userId: userId ? parseInt(userId as string) : undefined,
      status: status as TimesheetStatus | undefined,
      projectId: projectId ? parseInt(projectId as string) : undefined,
    },
    req.user.userId,
    req.user.role
  );

  res.status(HTTP_STATUS.OK).json({ success: true, data });
});

export const exportReport = tryCatch(async (req: Request, res: Response) => {
  const { format, dateFrom, dateTo, userId, status, projectId } = req.query;

  if (!dateFrom || !dateTo) {
    throw new ValidationError('dateFrom and dateTo are required');
  }

  const data = await reportsService.generateReport(
    req.user.orgId,
    {
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      userId: userId ? parseInt(userId as string) : undefined,
      status: status as TimesheetStatus | undefined,
      projectId: projectId ? parseInt(projectId as string) : undefined,
    },
    req.user.userId,
    req.user.role
  );

  if (format === 'csv') {
    const csv = generateCSV(data);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=highspring-report.csv');
    res.send(csv);
  } else if (format === 'excel') {
    const buffer = await generateExcel(data);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=highspring-report.xlsx');
    res.send(buffer);
  } else if (format === 'pdf') {
    const buffer = await generatePDF(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=highspring-report.pdf');
    res.send(buffer);
  } else {
    throw new ValidationError('Invalid format. Supported: csv, excel, pdf');
  }
});

export const exportMonthlyTimesheet = tryCatch(async (req: Request, res: Response) => {
  const { userId, year, month } = req.query;

  if (!year || !month) {
    throw new ValidationError('year and month are required query parameters');
  }

  const targetUserId = userId ? parseInt(userId as string) : req.user.userId;

  const data = await reportsService.generateMonthlyTimesheetData(
    req.user.orgId,
    targetUserId,
    parseInt(year as string),
    parseInt(month as string),
    req.user.userId,
    req.user.role
  );

  const buffer = await generateMonthlyTimesheetExcel(data);
  const filename = `timesheet-${data.employeeName.replace(/\s+/g, '-').toLowerCase()}-${data.month.replace("'", '')}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(buffer);
});
