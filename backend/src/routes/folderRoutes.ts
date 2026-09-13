import { Router } from 'express';
import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
} from '../controllers/folderController';
import { validate } from '../middleware/validate';
import { protect } from '../middleware/auth';
import { folderSchema, renameFolderSchema, mongoIdParam } from '../validators';

const router = Router();

router.use(protect);

router.get('/', listFolders);
router.post('/', validate(folderSchema), createFolder);
router.patch('/:id', validate(mongoIdParam, 'params'), validate(renameFolderSchema), renameFolder);
router.delete('/:id', validate(mongoIdParam, 'params'), deleteFolder);

export default router;