import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch';
import * as authService from '../services/auth.service';
import { prisma } from '../utils/db';
import { HTTP_STATUS, REFRESH_TOKEN_COOKIE } from '../utils/constants';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

export const register = tryCatch(async (req: Request, res: Response) => {
  const { accessToken, refreshToken, user } = await authService.registerUser(req.body);
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, COOKIE_OPTIONS);
  res.status(HTTP_STATUS.CREATED).json({ success: true, data: { accessToken, user } });
});

export const login = tryCatch(async (req: Request, res: Response) => {
  const { accessToken, refreshToken, user } = await authService.loginUser(req.body);
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, COOKIE_OPTIONS);
  res.status(HTTP_STATUS.OK).json({ success: true, data: { accessToken, user } });
});

export const refresh = tryCatch(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
  if (!token) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, error: 'No refresh token', code: 'UNAUTHORIZED' });
    return;
  }
  const { accessToken, userId } = await authService.refreshAccessToken(token);
  // Return user data so AuthContext can restore session on page refresh
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, organisationId: true, role: true, name: true, email: true } });
  const user = dbUser
    ? { userId: dbUser.id, orgId: dbUser.organisationId, role: dbUser.role, name: dbUser.name, email: dbUser.email }
    : null;
  res.status(HTTP_STATUS.OK).json({ success: true, data: { accessToken, user } });
});

export const logout = tryCatch(async (req: Request, res: Response) => {
  await authService.logoutUser(req.user.userId);
  res.clearCookie(REFRESH_TOKEN_COOKIE);
  res.status(HTTP_STATUS.OK).json({ success: true, data: { message: 'Logged out successfully' } });
});
