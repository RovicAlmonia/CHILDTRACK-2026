import { Request, Response } from 'express';
import pool from '../lib/db';
import { AuthRequest } from '../middleware/authMiddleware';
import { notifyParentsNewEvent } from './parentNotificationsController';

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_EVENT_TYPES = [
  'Meeting', 'Conference', 'School Event', 'Reminder', 'Holiday', 'Other',
] as const;

type EventType = typeof VALID_EVENT_TYPES[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateEventPayload(body: any): string[] {
  const errors: string[] = [];
  if (!body.title?.trim())
    errors.push('title is required');
  if (!body.scheduled_at)
    errors.push('scheduled_at is required (ISO 8601)');
  if (body.event_type && !VALID_EVENT_TYPES.includes(body.event_type as EventType))
    errors.push(`event_type must be one of: ${VALID_EVENT_TYPES.join(', ')}`);
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
//  EVENTS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/events */
export async function getAllEvents(req: Request, res: Response): Promise<void> {
  try {
    const {
      type,
      upcoming,
      search,
      limit  = '100',
      offset = '0',
    } = req.query as Record<string, string>;

    let sql            = 'SELECT * FROM events WHERE 1=1';
    const params: any[] = [];

    if (type) {
      sql += ' AND event_type = ?';
      params.push(type);
    }
    if (upcoming === 'true')  sql += ' AND scheduled_at >= NOW()';
    if (upcoming === 'false') sql += ' AND scheduled_at <  NOW()';
    if (search) {
      sql += ' AND (title LIKE ? OR description LIKE ? OR location LIKE ? OR teacher_name LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    sql += ' ORDER BY scheduled_at ASC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const [rows] = await pool.execute(sql, params) as any[];
    res.json(rows);
  } catch (err: any) {
    console.error('[getAllEvents]', err);
    res.status(500).json({ error: err.message, code: err.code, sql: err.sql });
  }
}

/** GET /api/events/:id */
export async function getEventById(req: Request, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM events WHERE id = ?',
      [req.params.id],
    ) as any[];

    if (!(rows as any[]).length) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }
    res.json((rows as any[])[0]);
  } catch (err: any) {
    console.error('[getEventById]', err);
    res.status(500).json({ error: err.message, code: err.code, sql: err.sql });
  }
}

/** POST /api/events */
export async function createEvent(req: AuthRequest, res: Response): Promise<void> {
  const errors = validateEventPayload(req.body);
  if (errors.length) {
    res.status(422).json({ error: errors.join('; ') });
    return;
  }

  try {
    const {
      title,
      description  = null,
      event_type   = 'Other',
      scheduled_at,
      location     = null,
      teacher_name = null,
      teacher_id   = null,
    } = req.body;

    const [result] = await pool.execute(
      `INSERT INTO events
         (teacher_id, title, description, event_type, scheduled_at, location, teacher_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [teacher_id, title.trim(), description, event_type, scheduled_at, location, teacher_name],
    ) as any[];

    const [rows] = await pool.execute(
      'SELECT * FROM events WHERE id = ?',
      [(result as any).insertId],
    ) as any[];

    notifyParentsNewEvent(title.trim(), description, scheduled_at, location, teacher_name)
      .catch(err => console.error('[createEvent] notifyParentsNewEvent failed:', err));

    res.status(201).json((rows as any[])[0]);
  } catch (err: any) {
    console.error('[createEvent]', err);
    res.status(500).json({ error: err.message, code: err.code, sql: err.sql });
  }
}

/** PATCH /api/events/:id */
export async function updateEvent(req: AuthRequest, res: Response): Promise<void> {
  const errors = validateEventPayload(req.body);
  if (errors.length) {
    res.status(422).json({ error: errors.join('; ') });
    return;
  }

  try {
    const {
      title,
      description  = null,
      event_type   = 'Other',
      scheduled_at,
      location     = null,
      teacher_name = null,
      teacher_id   = null,
    } = req.body;

    const [result] = await pool.execute(
      `UPDATE events
       SET teacher_id   = ?,
           title        = ?,
           description  = ?,
           event_type   = ?,
           scheduled_at = ?,
           location     = ?,
           teacher_name = ?
       WHERE id = ?`,
      [teacher_id, title.trim(), description, event_type, scheduled_at, location, teacher_name, req.params.id],
    ) as any[];

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    const [rows] = await pool.execute(
      'SELECT * FROM events WHERE id = ?',
      [req.params.id],
    ) as any[];

    res.json((rows as any[])[0]);
  } catch (err: any) {
    console.error('[updateEvent]', err);
    res.status(500).json({ error: err.message, code: err.code, sql: err.sql });
  }
}

/** DELETE /api/events/:id */
export async function deleteEvent(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [result] = await pool.execute(
      'DELETE FROM events WHERE id = ?',
      [req.params.id],
    ) as any[];

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }
    res.json({ message: 'Event deleted.' });
  } catch (err: any) {
    console.error('[deleteEvent]', err);
    res.status(500).json({ error: err.message, code: err.code, sql: err.sql });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ATTENDANCE NOTIFICATIONS  (queries the VIEW)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/notifications */
export async function getAllNotifications(req: Request, res: Response): Promise<void> {
  try {
    const {
      date,
      status,
      search,
      limit  = '200',
      offset = '0',
    } = req.query as Record<string, string>;

    let sql            = 'SELECT * FROM attendance_notifications WHERE 1=1';
    const params: any[] = [];

    if (date) {
      sql += ' AND date = ?';
      params.push(date);
    }

    if (status) {
      const statusMap: Record<string, string[]> = {
        'DROP-OFF': ['DROP-OFF', 'Drop-Off'],
        'PICK-UP':  ['PICK-UP',  'Pick-Up'],
      };
      const aliases = statusMap[status];
      if (aliases) {
        sql += ' AND status IN (?, ?)';
        params.push(...aliases);
      } else {
        sql += ' AND status = ?';
        params.push(status);
      }
    }

    if (search) {
      sql += ' AND student_name LIKE ?';
      params.push(`%${search}%`);
    }

    sql += ' ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const [rows] = await pool.execute(sql, params) as any[];
    res.json(rows);
  } catch (err: any) {
    console.error('[getAllNotifications]', err);
    res.status(500).json({ error: err.message, code: err.code, sql: err.sql });
  }
}

/** GET /api/notifications/summary — today's stat-card counts */
export async function getNotificationsSummary(_req: Request, res: Response): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [rows] = await pool.execute(
      `SELECT status, COUNT(*) AS count
       FROM attendance_notifications
       WHERE date = ?
       GROUP BY status`,
      [today],
    ) as any[];

    const summary = { total: 0, present: 0, late: 0, absent: 0, dropoff: 0, pickup: 0 };

    for (const { status, count } of rows as { status: string; count: string }[]) {
      const n = Number(count);
      summary.total += n;
      if      (status === 'Present')                          summary.present += n;
      else if (status === 'Late')                             summary.late    += n;
      else if (status === 'Absent')                           summary.absent  += n;
      else if (['DROP-OFF', 'Drop-Off'].includes(status))     summary.dropoff += n;
      else if (['PICK-UP',  'Pick-Up' ].includes(status))     summary.pickup  += n;
    }

    res.json({ date: today, ...summary });
  } catch (err: any) {
    console.error('[getNotificationsSummary]', err);
    res.status(500).json({ error: err.message, code: err.code, sql: err.sql });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  PERSISTENT NOTIFICATIONS  (notifications table)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/notifications/persistent */
export async function getPersistentNotifications(req: Request, res: Response): Promise<void> {
  try {
    const {
      teacher_id,
      is_read,
      type,
      limit  = '50',
      offset = '0',
    } = req.query as Record<string, string>;

    let sql            = 'SELECT * FROM notifications WHERE 1=1';
    const params: any[] = [];

    if (teacher_id) {
      sql += ' AND teacher_id = ?';
      params.push(teacher_id);
    }
    if (is_read !== undefined) {
      sql += ' AND is_read = ?';
      params.push(Number(is_read));
    }
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const [rows] = await pool.execute(sql, params) as any[];
    res.json(rows);
  } catch (err: any) {
    console.error('[getPersistentNotifications]', err);
    res.status(500).json({ error: err.message, code: err.code, sql: err.sql });
  }
}

/** PATCH /api/notifications/persistent/:id/read */
export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  try {
    const [result] = await pool.execute(
      'UPDATE notifications SET is_read = 1 WHERE id = ?',
      [req.params.id],
    ) as any[];

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    res.json({ message: 'Marked as read.' });
  } catch (err: any) {
    console.error('[markNotificationRead]', err);
    res.status(500).json({ error: err.message, code: err.code, sql: err.sql });
  }
}

/** PATCH /api/notifications/persistent/read-all */
export async function markAllNotificationsRead(req: Request, res: Response): Promise<void> {
  try {
    const { teacher_id } = req.body as { teacher_id?: number };

    let sql            = 'UPDATE notifications SET is_read = 1 WHERE is_read = 0';
    const params: any[] = [];

    if (teacher_id) {
      sql += ' AND teacher_id = ?';
      params.push(teacher_id);
    }

    const [result] = await pool.execute(sql, params) as any[];
    res.json({
      message: 'All notifications marked as read.',
      updated: (result as any).affectedRows,
    });
  } catch (err: any) {
    console.error('[markAllNotificationsRead]', err);
    res.status(500).json({ error: err.message, code: err.code, sql: err.sql });
  }
}
