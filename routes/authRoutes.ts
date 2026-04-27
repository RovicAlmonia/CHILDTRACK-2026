import { Router } from 'express';
import { register, login }               from '../controllers/authcontroller';
import { updateProfile, changePassword } from '../controllers/teachersController';
import { protect }                        from '../middleware/authMiddleware';

const router = Router();

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post('/register', register);
router.post('/login',    login);

// ─── Teacher profile ──────────────────────────────────────────────────────────
router.put('/:id',                 protect, updateProfile);
router.put('/:id/change-password', protect, changePassword);

export default router;