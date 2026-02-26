import { Router } from 'express';
import * as ctrl from '../controllers/projects.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createProjectSchema, updateProjectSchema } from '../types/schemas';

const router = Router();

router.use(authenticate);

// All authenticated users can view projects (for timesheet entry dropdowns)
router.get('/', ctrl.list);

// Write operations: Manager + Admin
router.post('/', requireRole('MANAGER', 'ADMIN'), validate(createProjectSchema), ctrl.create);
router.put('/:id', requireRole('MANAGER', 'ADMIN'), validate(updateProjectSchema), ctrl.update);
router.delete('/:id', requireRole('MANAGER', 'ADMIN'), ctrl.remove);

export default router;
