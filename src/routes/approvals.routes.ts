import { Router } from 'express';
import * as ctrl from '../controllers/approvals.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';

const router = Router();

// All approval routes require Manager or Admin role
router.use(authenticate, requireRole('MANAGER', 'ADMIN'));

router.get('/', ctrl.list);
router.get('/stats', ctrl.stats);
router.post('/:id/approve', ctrl.approve);
router.post('/:id/reject', ctrl.reject);

export default router;
