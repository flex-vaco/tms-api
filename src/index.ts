import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { logger } from './utils/logger';
import { connectDB, disconnectDB } from './utils/db';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';

// Route modules
import authRoutes from './routes/auth.routes';
import timesheetsRoutes from './routes/timesheets.routes';
import approvalsRoutes from './routes/approvals.routes';
import reportsRoutes from './routes/reports.routes';
import projectsRoutes from './routes/projects.routes';
import usersRoutes from './routes/users.routes';
import holidaysRoutes from './routes/holidays.routes';
import settingsRoutes from './routes/settings.routes';
import notificationsRoutes from './routes/notifications.routes';
import teamRoutes from './routes/team.routes';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const API_PREFIX = '/api/v1';

// ---- Security & parsing middleware ----
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  credentials: true, // Required for httpOnly cookie exchange
}));
app.use(express.json());
app.use(cookieParser());

// ---- General rate limiting ----
app.use(API_PREFIX, apiLimiter);

// ---- Health check ----
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- API routes ----
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/timesheets`, timesheetsRoutes);
app.use(`${API_PREFIX}/approvals`, approvalsRoutes);
app.use(`${API_PREFIX}/reports`, reportsRoutes);
app.use(`${API_PREFIX}/projects`, projectsRoutes);
app.use(`${API_PREFIX}/users`, usersRoutes);
app.use(`${API_PREFIX}/holidays`, holidaysRoutes);
app.use(`${API_PREFIX}/settings`, settingsRoutes);
app.use(`${API_PREFIX}/notifications`, notificationsRoutes);
app.use(`${API_PREFIX}/team`, teamRoutes);

// ---- 404 catch-all ----
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found', code: 'NOT_FOUND' });
});

// ---- Central error handler (must be last) ----
app.use(errorHandler);

// ---- Bootstrap ----
async function start(): Promise<void> {
  await connectDB();
  const server = app.listen(PORT, () => {
    logger.info(`Highspring India TMS API running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  });

  // Graceful shutdown — close DB connections before exiting
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
