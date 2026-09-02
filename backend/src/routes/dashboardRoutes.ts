import { Router } from 'express';
import {
  getStats,
  getActivity,
  getAnalytics,
} from '../controllers/dashboardController';
import { listActivityLogs } from '../controllers/adminController';
import { protect } from '../middleware/auth';

const router = Router();

router.use(protect);
router.get('/stats', getStats);
router.get('/activity', getActivity);
router.get('/activity-logs', listActivityLogs);
router.get('/analytics', getAnalytics);

export default router;
