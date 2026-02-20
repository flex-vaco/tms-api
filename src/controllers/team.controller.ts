import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch';
import * as teamService from '../services/team.service';
import { HTTP_STATUS } from '../utils/constants';

export const myReports = tryCatch(async (req: Request, res: Response) => {
  const data = await teamService.getTeamMembers(req.user.userId, req.user.orgId);
  res.status(HTTP_STATUS.OK).json({ success: true, data });
});

export const myManagers = tryCatch(async (req: Request, res: Response) => {
  const data = await teamService.getManagersOfUser(req.user.userId, req.user.orgId);
  res.status(HTTP_STATUS.OK).json({ success: true, data });
});

export const getUserManagers = tryCatch(async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id);
  const data = await teamService.getManagersOfUser(userId, req.user.orgId);
  res.status(HTTP_STATUS.OK).json({ success: true, data });
});

export const setUserManagers = tryCatch(async (req: Request, res: Response) => {
  const userId = parseInt(req.params.id);
  const { managerIds } = req.body as { managerIds: number[] };
  await teamService.assignManagers(userId, managerIds, req.user.orgId);
  res.status(HTTP_STATUS.OK).json({ success: true, data: { message: 'Managers updated' } });
});
