import { Router } from 'express';
import * as ctrl from '../controllers/users.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';

const router = Router();

// User management: Manager (scoped to direct reports) + Admin (org-wide)
router.use(authenticate, requireRole('MANAGER', 'ADMIN'));

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;
