import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { ForbiddenError } from '../types/errors';

// Role-based access control middleware factory.
// Usage: router.get('/approvals', authenticate, requireRole('MANAGER', 'ADMIN'), ctrl.list)
export const requireRole = (...roles: UserRole[]) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    const req = _req as Request;
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }
    next();
  };
