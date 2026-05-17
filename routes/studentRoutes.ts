import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  getStudents,
  createStudent,
  getStudentById,
  activateParentAccount,
} from '../controllers/studentController';

const router = Router();

router.get('/students/debug', authMiddleware, debugStudents);
router.get('/',    protect, getStudents);
router.post('/',   protect, createStudent);
router.get('/:id', protect, getStudentById);
router.patch('/:id/activate-parent', protect, activateParentAccount);

export default router;
