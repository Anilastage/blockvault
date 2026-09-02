import { Router } from 'express';
import {
  verifyUploadedFile,
  verifyByHash,
  getHistory,
  getDocumentVerifications,
  downloadRegisteredDocument,
} from '../controllers/verificationController';
import { documentUpload } from '../middleware/upload';
import { validate } from '../middleware/validate';
import { protect } from '../middleware/auth';
import { verifyByHashSchema, documentIdParam } from '../validators';

const router = Router();

router.use(protect);

router.post('/upload', documentUpload.single('file'), verifyUploadedFile);
router.post('/hash', validate(verifyByHashSchema), verifyByHash);
router.get('/history', getHistory);
router.get('/download/:documentId', validate(documentIdParam, 'params'), downloadRegisteredDocument);
router.get('/:documentId', validate(documentIdParam, 'params'), getDocumentVerifications);

export default router;
