import { Request, Response, NextFunction, RequestHandler } from 'express';

// Wraps async route handlers to forward errors to Express error middleware
// Eliminates repetitive try/catch boilerplate in every controller
export const tryCatch = (fn: RequestHandler): RequestHandler =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
