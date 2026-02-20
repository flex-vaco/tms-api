import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch';
import * as settingsService from '../services/settings.service';
import { HTTP_STATUS } from '../utils/constants';

export const get = tryCatch(async (req: Request, res: Response) => {
  const data = await settingsService.getSettings(req.user.orgId);
  res.status(HTTP_STATUS.OK).json({ success: true, data });
});

export const update = tryCatch(async (req: Request, res: Response) => {
  const data = await settingsService.updateSettings(req.user.orgId, req.body);
  res.status(HTTP_STATUS.OK).json({ success: true, data });
});
