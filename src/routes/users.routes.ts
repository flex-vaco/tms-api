import { Router } from 'express';
import * as ctrl from '../controllers/users.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createUserSchema, updateUserSchema } from '../types/schemas';

const router = Router();

// User management: Manager (scoped to direct reports) + Admin (org-wide)
router.use(authenticate, requireRole('MANAGER', 'ADMIN'));

router.get('/', ctrl.list);
router.post('/', validate(createUserSchema), ctrl.create);
router.put('/:id', validate(updateUserSchema), ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;
