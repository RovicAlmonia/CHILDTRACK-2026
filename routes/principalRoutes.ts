// routes/principalRoutes.ts
// ─────────────────────────────────────────────────────────────────────────────
// ChildTrack — Principal Admin Routes (TypeScript)
//
// Mount in your main api.ts / app.ts:
//   import principalRoutes from './routes/principalRoutes';
//   app.use('/api/principal', principalRoutes);
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import * as controller from '../controllers/principalController';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE — Principal JWT Guard
// ─────────────────────────────────────────────────────────────────────────────

interface PrincipalPayload {
  id: number;
  role: string;
  name: string;
}

// Extend Express Request to include req.principal
declare global {
  namespace Express {
    interface Request {
      principal?: PrincipalPayload;
    }
  }
}

const principalProtect = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No token provided.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as PrincipalPayload;

    if (decoded.role !== 'principal') {
      res.status(403).json({ message: 'Access denied: principal only.' });
      return;
    }

    req.principal = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/principal/login */
router.post('/login', controller.login);

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTED ROUTES (JWT REQUIRED)
// ─────────────────────────────────────────────────────────────────────────────
router.use(principalProtect);

// ───────────── PROFILE ─────────────

/** GET    /api/principal/profile */
router.get('/profile', controller.getProfile);

/** PUT    /api/principal/profile */
router.put('/profile', controller.updateProfile);

/** PUT    /api/principal/change-password */
router.put('/change-password', controller.changePassword);

// ───────────── DASHBOARD ─────────────

/** GET /api/principal/overview */
router.get('/overview', controller.getOverview);

// ───────────── ATTENDANCE ─────────────

/** GET /api/principal/attendance */
router.get('/attendance', controller.getAllAttendance);

// ───────────── ABSENCES ─────────────

/** GET    /api/principal/absences */
router.get('/absences', controller.getAllAbsences);

/** PATCH  /api/principal/absences/:id/status */
router.patch('/absences/:id/status', controller.updateAbsenceStatus);

// ───────────── EVENTS ─────────────

/** GET    /api/principal/events */
router.get('/events', controller.getAllEvents);

/** POST   /api/principal/events */
router.post('/events', controller.createEvent);

/** PUT    /api/principal/events/:id */
router.put('/events/:id', controller.updateEvent);

/** DELETE /api/principal/events/:id */
router.delete('/events/:id', controller.deleteEvent);

// ───────────── TEACHERS ─────────────

/** GET /api/principal/teachers */
router.get('/teachers', controller.getAllTeachers);

// ───────────── STUDENTS ─────────────

/** GET /api/principal/students */
router.get('/students', controller.getAllStudents);

// ───────────── SCHEDULES ─────────────

/** GET /api/principal/schedules */
router.get('/schedules', controller.getAllSchedules);

// ───────────── GUARDIANS ─────────────

/** GET /api/principal/guardians */
router.get('/guardians', controller.getAllGuardians);

// ─────────────────────────────────────────────────────────────────────────────

export default router;