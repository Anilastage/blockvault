import { Router } from 'express';
import {
  overview,
  documentsAnalytics,
  verificationsAnalytics,
  blockchainAnalytics,
  exportCsv,
} from '../controllers/analyticsController';
import { protect } from '../middleware/auth';

const router = Router();

router.use(protect);
router.get('/overview', overview);
router.get('/documents', documentsAnalytics);
router.get('/verifications', verificationsAnalytics);
router.get('/blockchain', blockchainAnalytics);
router.get('/export', exportCsv);

export default router;
