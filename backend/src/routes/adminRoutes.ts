import { Router } from 'express';
import {
  listUsers,
  changeUserRole,
  changeUserStatus,
  listDocuments,
  listTransactions,
  getSystemAnalytics,
  listActivityLogs,
} from '../controllers/adminController';
import { validate } from '../middleware/validate';
import {
  paginationQuery,
  mongoIdParam,
  changeRoleSchema,
  changeStatusSchema,
} from '../validators';
import { protect, adminOnly } from '../middleware/auth';

const router = Router();

// Every admin route requires both a valid token and the ADMIN role.
router.use(protect, adminOnly);

router.get('/users', validate(paginationQuery.partial(), 'query'), listUsers);
router.put('/users/:id/role', validate(mongoIdParam, 'params'), validate(changeRoleSchema), changeUserRole);
router.put('/users/:id/status', validate(mongoIdParam, 'params'), validate(changeStatusSchema), changeUserStatus);

router.get('/documents', validate(paginationQuery.partial(), 'query'), listDocuments);
router.get('/transactions', listTransactions);
router.get('/analytics', getSystemAnalytics);
router.get('/activity-logs', listActivityLogs);

export default router;
