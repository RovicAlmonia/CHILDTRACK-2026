import { Router } from 'express';
import {
  getAllEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getAllNotifications,
  getNotificationsSummary,
  getPersistentNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../controllers/notificationsEventsController';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
//  EVENTS  →  mounted at /api  so final paths are /api/events
// ─────────────────────────────────────────────────────────────────────────────
// eventsAPI.getAll()           GET    /api/events
// eventsAPI.getOne(id)         GET    /api/events/:id
// eventsAPI.create(data)       POST   /api/events
// eventsAPI.update(id, data)   PATCH  /api/events/:id
// eventsAPI.remove(id)         DELETE /api/events/:id
router.get   ('/events',     getAllEvents);
router.get   ('/events/:id', getEventById);
router.post  ('/events',     createEvent);
router.patch ('/events/:id', updateEvent);
router.delete('/events/:id', deleteEvent);

// ─────────────────────────────────────────────────────────────────────────────
//  NOTIFICATIONS
//  IMPORTANT: specific paths MUST come before wildcard paths
// ─────────────────────────────────────────────────────────────────────────────
// Attendance VIEW          → GET   /api/notifications
// Stat-card summary        → GET   /api/notifications/summary
// Persistent log           → GET   /api/notifications/persistent
// Mark all read            → PATCH /api/notifications/persistent/read-all
// Mark one read            → PATCH /api/notifications/persistent/:id/read
router.get  ('/notifications/summary',             getNotificationsSummary);   // ← before plain /notifications
router.get  ('/notifications',                     getAllNotifications);
router.get  ('/notifications/persistent',          getPersistentNotifications);
router.patch('/notifications/persistent/read-all', markAllNotificationsRead);  // ← before /:id/read
router.patch('/notifications/persistent/:id/read', markNotificationRead);

export default router;