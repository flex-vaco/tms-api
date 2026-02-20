import { Router } from 'express';
import * as ctrl from '../controllers/timesheets.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// All timesheet routes require authentication
router.use(authenticate);

// Timesheet CRUD
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.post('/copy-previous-week', ctrl.copyPreviousWeek);
router.get('/:id', ctrl.getOne);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/submit', ctrl.submit);

// Time Entries (nested under timesheets)
router.get('/:id/entries', ctrl.listEntries);
router.post('/:id/entries', ctrl.createEntry);
router.put('/:id/entries/:eid', ctrl.updateEntry);
router.delete('/:id/entries/:eid', ctrl.deleteEntry);

export default router;
