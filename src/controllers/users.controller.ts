import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch';
import * as usersService from '../services/users.service';
import { HTTP_STATUS, DEFAULT_PAGE, DEFAULT_LIMIT } from '../utils/constants';

export const list = tryCatch(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || DEFAULT_PAGE;
  const limit = Math.min(parseInt(req.query.limit as string) || DEFAULT_LIMIT, 100);
  const result = await usersService.listUsers(
    req.user.orgId, req.user.userId, req.user.role, page, limit
  );
  res.status(HTTP_STATUS.OK).json({ success: true, ...result });
});

export const create = tryCatch(async (req: Request, res: Response) => {
  const user = await usersService.createUser(
    req.user.orgId, req.body, req.user.userId, req.user.role
  );
  res.status(HTTP_STATUS.CREATED).json({ success: true, data: user });
});

export const update = tryCatch(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const user = await usersService.updateUser(
    id, req.user.orgId, req.body, req.user.userId, req.user.role
  );
  res.status(HTTP_STATUS.OK).json({ success: true, data: user });
});

export const remove = tryCatch(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await usersService.deactivateUser(id, req.user.orgId, req.user.userId, req.user.role);
  res.status(HTTP_STATUS.OK).json({ success: true, data: { message: 'User deactivated' } });
});
