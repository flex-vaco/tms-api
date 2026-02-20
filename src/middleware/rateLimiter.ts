import rateLimit from 'express-rate-limit';
import { HTTP_STATUS } from '../utils/constants';

// General API rate limit — 100 requests per 15 minutes per IP
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests, please try again later',
    code: 'RATE_LIMITED',
  },
  statusCode: HTTP_STATUS.BAD_REQUEST,
});

// Tighter limit for authentication endpoints to mitigate brute-force attacks
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
    code: 'AUTH_RATE_LIMITED',
  },
  statusCode: HTTP_STATUS.BAD_REQUEST,
});
