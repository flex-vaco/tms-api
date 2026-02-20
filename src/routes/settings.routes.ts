import { Router } from 'express';
import * as ctrl from '../controllers/settings.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';

const router = Router();

// Settings management is Admin-only
router.use(authenticate, requireRole('ADMIN'));

router.get('/', ctrl.get);
router.put('/', ctrl.update);

export default router;
