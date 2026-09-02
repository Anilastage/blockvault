import { Router } from 'express';
import {
  createDocument,
  getDocuments,
  getDocumentById,
  downloadDocument,
  getDocumentDownloads,
  getDownloadCode,
  regenerateDownloadCodeHandler,
  deleteDocument,
} from '../controllers/documentController';
import { documentUpload } from '../middleware/upload';
import { validate } from '../middleware/validate';
import { createDocumentSchema, mongoIdParam } from '../validators';
import { protect } from '../middleware/auth';

const router = Router();

router.use(protect);

router.post(
  '/',
  documentUpload.single('file'),
  (req, res, next) => {
    // Multer delivers multipart fields as strings; coerce numeric fields
    // before Zod validation so the shared schema stays type-safe.
    if (typeof req.body?.fileSize === 'string') req.body.fileSize = Number(req.body.fileSize);
    if (typeof req.body?.blockNumber === 'string' && req.body.blockNumber !== '') {
      req.body.blockNumber = Number(req.body.blockNumber);
    } else if (req.body?.blockNumber === '') {
      delete req.body.blockNumber;
    }
    next();
  },
  validate(createDocumentSchema),
  createDocument
);
router.get('/', getDocuments);
router.get('/:id', validate(mongoIdParam, 'params'), getDocumentById);
router.get('/:id/download', validate(mongoIdParam, 'params'), downloadDocument);
router.get('/:id/downloads', validate(mongoIdParam, 'params'), getDocumentDownloads);
router.get('/:id/download-code', validate(mongoIdParam, 'params'), getDownloadCode);
router.post(
  '/:id/download-code/regenerate',
  validate(mongoIdParam, 'params'),
  regenerateDownloadCodeHandler
);
router.delete('/:id', validate(mongoIdParam, 'params'), deleteDocument);

export default router;
