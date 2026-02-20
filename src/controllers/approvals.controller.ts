import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch';
import * as approvalsService from '../services/approvals.service';
import { HTTP_STATUS, DEFAULT_PAGE, DEFAULT_LIMIT } from '../utils/constants';

export const list = tryCatch(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || DEFAULT_PAGE;
  const limit = Math.min(parseInt(req.query.limit as string) || DEFAULT_LIMIT, 100);
  const result = await approvalsService.listPendingApprovals(
    req.user.orgId, req.user.userId, req.user.role, page, limit
  );
  res.status(HTTP_STATUS.OK).json({ success: true, ...result });
});

export const stats = tryCatch(async (req: Request, res: Response) => {
  const data = await approvalsService.getApprovalStats(req.user.orgId, req.user.userId, req.user.role);
  res.status(HTTP_STATUS.OK).json({ success: true, data });
});

export const approve = tryCatch(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const timesheet = await approvalsService.approveTimesheet(
    id, req.user.userId, req.user.orgId, req.user.role
  );
  res.status(HTTP_STATUS.OK).json({ success: true, data: timesheet });
});

export const reject = tryCatch(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { reason } = req.body as { reason: string };
  const timesheet = await approvalsService.rejectTimesheet(
    id, req.user.userId, req.user.orgId, reason, req.user.role
  );
  res.status(HTTP_STATUS.OK).json({ success: true, data: timesheet });
});
