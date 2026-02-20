import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/db';
import { JwtPayload, RegisterDto, LoginDto } from '../types';
import { UnauthorizedError, ConflictError } from '../types/errors';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    userId: number;
    orgId: number;
    role: string;
    name: string;
    email: string;
  };
}

const BCRYPT_ROUNDS = 12;

function signAccessToken(payload: JwtPayload): string {
  const secret = process.env.JWT_SECRET!;
  const expiresIn = process.env.JWT_EXPIRES_IN ?? '15m';
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

function signRefreshToken(payload: JwtPayload): string {
  const secret = process.env.JWT_REFRESH_SECRET!;
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export async function registerUser(dto: RegisterDto): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: dto.email } });
  if (existing) {
    throw new ConflictError('Email address is already registered');
  }

  const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

  // Create org + admin user + default settings in a single transaction
  const user = await prisma.$transaction(async (tx) => {
    const org = await tx.organisation.create({ data: { name: dto.organisationName } });
    await tx.orgSettings.create({ data: { organisationId: org.id } });
    return tx.user.create({
      data: {
        organisationId: org.id,
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: 'ADMIN', // First user of an org is always the admin
      },
    });
  });

  const payload: JwtPayload = { userId: user.id, orgId: user.organisationId, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Persist hashed refresh token for rotation/revocation support
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: await bcrypt.hash(refreshToken, BCRYPT_ROUNDS) },
  });

  return {
    accessToken,
    refreshToken,
    user: { userId: user.id, orgId: user.organisationId, role: user.role, name: user.name, email: user.email },
  };
}

export async function loginUser(dto: LoginDto): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: dto.email } });
  if (!user || user.status === 'inactive') {
    // Use the same error message to prevent user enumeration
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await bcrypt.compare(dto.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const payload: JwtPayload = { userId: user.id, orgId: user.organisationId, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: await bcrypt.hash(refreshToken, BCRYPT_ROUNDS) },
  });

  return {
    accessToken,
    refreshToken,
    user: { userId: user.id, orgId: user.organisationId, role: user.role, name: user.name, email: user.email },
  };
}

export async function refreshAccessToken(incomingRefreshToken: string): Promise<{ accessToken: string; userId: number }> {
  const secret = process.env.JWT_REFRESH_SECRET!;
  let payload: JwtPayload;

  try {
    payload = jwt.verify(incomingRefreshToken, secret) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user?.refreshToken) {
    throw new UnauthorizedError('Refresh token revoked');
  }

  const tokenMatch = await bcrypt.compare(incomingRefreshToken, user.refreshToken);
  if (!tokenMatch) {
    throw new UnauthorizedError('Refresh token mismatch');
  }

  const newPayload: JwtPayload = { userId: user.id, orgId: user.organisationId, role: user.role };
  const accessToken = signAccessToken(newPayload);

  return { accessToken, userId: user.id };
}

export async function logoutUser(userId: number): Promise<void> {
  // Clear refresh token to invalidate all refresh attempts
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  });
}
