import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { createGuardian, getGuardians,updateGuardianStatus  } from '../controllers/guardianController';

const router = Router();

router.get('/',  protect, getGuardians);
router.post('/', protect, createGuardian);
router.patch('/:id/status', protect, updateGuardianStatus); // ← add this

export default router;