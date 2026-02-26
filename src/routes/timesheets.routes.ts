import { Router } from 'express';
import * as ctrl from '../controllers/timesheets.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import {
  createTimesheetSchema,
  updateTimesheetSchema,
  createTimeEntrySchema,
  updateTimeEntrySchema,
} from '../types/schemas';

const router = Router();

// All timesheet routes require authentication
router.use(authenticate);

// Timesheet CRUD
router.get('/', ctrl.list);
router.post('/', validate(createTimesheetSchema), ctrl.create);
router.post('/copy-previous-week', ctrl.copyPreviousWeek);
router.get('/:id', ctrl.getOne);
router.put('/:id', validate(updateTimesheetSchema), ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/submit', ctrl.submit);

// Time Entries (nested under timesheets)
router.get('/:id/entries', ctrl.listEntries);
router.post('/:id/entries', validate(createTimeEntrySchema), ctrl.createEntry);
router.put('/:id/entries/:eid', validate(updateTimeEntrySchema), ctrl.updateEntry);
router.delete('/:id/entries/:eid', ctrl.deleteEntry);

export default router;
