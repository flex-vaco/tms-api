import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch';
import * as notificationsService from '../services/notifications.service';
import { HTTP_STATUS } from '../utils/constants';

export const list = tryCatch(async (req: Request, res: Response) => {
  const data = await notificationsService.listNotifications(req.user.userId);
  res.status(HTTP_STATUS.OK).json({ success: true, data });
});

export const markRead = tryCatch(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const data = await notificationsService.markAsRead(id, req.user.userId);
  res.status(HTTP_STATUS.OK).json({ success: true, data });
});

export const markAllRead = tryCatch(async (req: Request, res: Response) => {
  await notificationsService.markAllAsRead(req.user.userId);
  res.status(HTTP_STATUS.OK).json({ success: true, data: { message: 'All notifications marked as read' } });
});
