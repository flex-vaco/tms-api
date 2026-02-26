import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { authLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { registerSchema, loginSchema } from '../types/schemas';

const router = Router();

// Public routes — rate-limited to resist brute-force attacks
router.post('/register', authLimiter, validate(registerSchema), ctrl.register);
router.post('/login', authLimiter, validate(loginSchema), ctrl.login);
router.post('/refresh', authLimiter, ctrl.refresh);

// Authenticated route
router.post('/logout', authenticate, ctrl.logout);

export default router;
