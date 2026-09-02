import { Router } from 'express';
import {
  getConfig,
  getStatus,
  listTransactions,
  getByHash,
  getTransaction,
} from '../controllers/blockchainController';
import { protect } from '../middleware/auth';

const router = Router();

router.get('/config', getConfig);
router.use(protect);
router.get('/status', getStatus);
router.get('/transactions', listTransactions);
router.get('/transaction/:txHash', getTransaction);
router.get('/:hash', getByHash);

export default router;
