import { Router } from 'express';
import * as ctrl from '../controllers/settings.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { updateSettingsSchema } from '../types/schemas';

const router = Router();

// Settings management is Admin-only
router.use(authenticate, requireRole('ADMIN'));

router.get('/', ctrl.get);
router.put('/', validate(updateSettingsSchema), ctrl.update);

export default router;
