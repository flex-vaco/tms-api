import { Router } from 'express';
import * as ctrl from '../controllers/team.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { setUserManagersSchema } from '../types/schemas';

const router = Router();

router.use(authenticate);

// Any authenticated user can see their own managers
router.get('/my-managers', ctrl.myManagers);

// Managers+ can see their direct reports
router.get('/my-reports', requireRole('MANAGER', 'ADMIN'), ctrl.myReports);

// Admin-only: view/set managers for a specific user
router.get('/users/:id/managers', requireRole('ADMIN'), ctrl.getUserManagers);
router.put('/users/:id/managers', requireRole('ADMIN'), validate(setUserManagersSchema), ctrl.setUserManagers);

export default router;
