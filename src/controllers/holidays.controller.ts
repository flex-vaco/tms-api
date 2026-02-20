import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch';
import * as holidaysService from '../services/holidays.service';
import { HTTP_STATUS } from '../utils/constants';

export const list = tryCatch(async (req: Request, res: Response) => {
  const year = req.query.year ? parseInt(req.query.year as string) : undefined;
  const data = await holidaysService.listHolidays(req.user.orgId, year);
  res.status(HTTP_STATUS.OK).json({ success: true, data });
});

export const create = tryCatch(async (req: Request, res: Response) => {
  const holiday = await holidaysService.createHoliday(req.user.orgId, req.body);
  res.status(HTTP_STATUS.CREATED).json({ success: true, data: holiday });
});

export const remove = tryCatch(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await holidaysService.deleteHoliday(id, req.user.orgId);
  res.status(HTTP_STATUS.OK).json({ success: true, data: { message: 'Holiday deleted' } });
});
