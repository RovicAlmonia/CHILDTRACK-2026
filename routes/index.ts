import { Router } from 'express';
import { submitAbsenceReason, getAbsenceReasons, updateAbsenceReasonStatus } from '../controllers/absenceReasonsController';
import { getParentNotifications, markParentNotificationRead, saveExpoPushToken } from '../controllers/parentNotificationsController';
import {
  getStudentSchedules,
  createStudentSchedule,
  updateStudentSchedule,
  deleteStudentSchedule,
} from '../controllers/studentSchedulesController';
import { parentLogin, updateParentProfile, changeParentPassword } from '../controllers/parentAuthController';

const router = Router();

// Absence Reasons
router.post('/absence-reasons', submitAbsenceReason);
router.get('/absence-reasons', getAbsenceReasons);
router.patch('/absence-reasons/:id/status', updateAbsenceReasonStatus);

// Parent Notifications
router.get('/parent-notifications', getParentNotifications);
router.patch('/parent-notifications/:id/read', markParentNotificationRead);
router.post('/parent-notifications/push-token', saveExpoPushToken);

// inside your router file, replace the two schedule lines with:
router.get('/student-schedules',        getStudentSchedules);
router.post('/student-schedules',       createStudentSchedule);
router.patch('/student-schedules/:id',  updateStudentSchedule);
router.delete('/student-schedules/:id', deleteStudentSchedule);

// Parent Auth
router.post('/parent-auth/login', parentLogin);
router.patch('/parent-auth/:id/profile', updateParentProfile);
router.patch('/parent-auth/:id/password', changeParentPassword);

export default router;