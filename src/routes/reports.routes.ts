import { Router } from 'express';
import * as ctrl from '../controllers/reports.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';

const router = Router();

router.use(authenticate);

// Full report generation — Manager/Admin only
router.get('/', requireRole('MANAGER', 'ADMIN'), ctrl.generate);

// Export — all roles (employees are scoped to own data in the service layer)
router.get('/export', ctrl.exportReport);

// Monthly timesheet export — all roles (scoped in service layer)
router.get('/export-monthly', ctrl.exportMonthlyTimesheet);

export default router;
