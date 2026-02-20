import { Router } from 'express';
import * as ctrl from '../controllers/projects.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';

const router = Router();

router.use(authenticate);

// All authenticated users can view projects (for timesheet entry dropdowns)
router.get('/', ctrl.list);

// Write operations: Manager + Admin
router.post('/', requireRole('MANAGER', 'ADMIN'), ctrl.create);
router.put('/:id', requireRole('MANAGER', 'ADMIN'), ctrl.update);
router.delete('/:id', requireRole('MANAGER', 'ADMIN'), ctrl.remove);

export default router;
