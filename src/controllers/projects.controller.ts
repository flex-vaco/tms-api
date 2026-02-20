import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch';
import * as projectsService from '../services/projects.service';
import { HTTP_STATUS, DEFAULT_PAGE, DEFAULT_LIMIT } from '../utils/constants';

export const list = tryCatch(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || DEFAULT_PAGE;
  const limit = Math.min(parseInt(req.query.limit as string) || DEFAULT_LIMIT, 100);
  const result = await projectsService.listProjects(req.user.orgId, req.user.userId, req.user.role, page, limit);
  res.status(HTTP_STATUS.OK).json({ success: true, ...result });
});

export const create = tryCatch(async (req: Request, res: Response) => {
  const project = await projectsService.createProject(req.user.orgId, req.body, req.user.userId, req.user.role);
  res.status(HTTP_STATUS.CREATED).json({ success: true, data: project });
});

export const update = tryCatch(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const project = await projectsService.updateProject(id, req.user.orgId, req.body);
  res.status(HTTP_STATUS.OK).json({ success: true, data: project });
});

export const remove = tryCatch(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await projectsService.deleteProject(id, req.user.orgId);
  res.status(HTTP_STATUS.OK).json({ success: true, data: { message: 'Project deleted' } });
});
