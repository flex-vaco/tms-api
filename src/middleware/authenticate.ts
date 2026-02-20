import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types';
import { UnauthorizedError } from '../types/errors';
import { tryCatch } from '../utils/tryCatch';

// Validates the Bearer access token on every protected route
export const authenticate = tryCatch(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }

    const payload = jwt.verify(token, secret) as JwtPayload;
    req.user = payload;
    next();
  }
);
