import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { parentProtect } from '../middleware/parentAuthMiddleware';
import {
  getAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendanceForParent,
} from '../controllers/attendanceController';

const router = Router();

router.get('/',           protect,        getAttendance);
router.post('/',          protect,        createAttendance);
router.get('/for-parent', parentProtect,  getAttendanceForParent); // ✅ moved up
router.patch('/:id',      protect,        updateAttendance);
router.delete('/:id',     protect,        deleteAttendance);

export default router;