import { Router } from 'express';
import * as ctrl from '../controllers/holidays.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createHolidaySchema } from '../types/schemas';

const router = Router();

router.use(authenticate);

// All authenticated users can view holidays (calendar awareness)
router.get('/', ctrl.list);

// Write operations are Admin-only
router.post('/', requireRole('ADMIN'), validate(createHolidaySchema), ctrl.create);
router.delete('/:id', requireRole('ADMIN'), ctrl.remove);

export default router;
