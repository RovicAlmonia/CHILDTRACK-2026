// controllers/principalController.ts
// ─────────────────────────────────────────────────────────────────────────────
// ChildTrack — Principal Admin Controller (TypeScript)
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../lib/db';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

// ─── promise helper ───────────────────────────────────────────────────────────
const query = async <T = RowDataPacket[]>(sql: string, params: any[] = []): Promise<T> => {
  const [rows] = await pool.query(sql, params);
  return rows as T;
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface AttendanceRow extends RowDataPacket {
  id: number;
  teacher_id: number;
  student_name: string;
  lrn: string;
  status: string;
  session: string;
  date: string;
  teacher_name: string;
  section: string;
}

interface AbsenceRow extends RowDataPacket {
  id: number;
  teacher_id: number;
  student_name: string;
  lrn: string;
  reason: string;
  date: string;
  submitted_by: string;
  parent_contact: string;
  status: string;
  created_at: string;
  teacher_name: string;
  section: string;
}

interface EventRow extends RowDataPacket {
  id: number;
  teacher_id: number | null;
  title: string;
  description: string;
  event_type: string;
  scheduled_at: string;
  location: string;
  teacher_name: string;
  created_at: string;
  section: string;
}

interface TeacherRow extends RowDataPacket {
  id: number;
  name: string;
  username: string;
  age: number;
  gender: string;
  section: string;
  contact: string;
  address: string;
  created_at: string;
  student_count: number;
  photo_base64: string | null; // ✅ added
}

interface StudentRow extends RowDataPacket {
  id: number;
  teacher_id: number;
  lrn: string;
  name: string;
  gender: string;
  created_at: string;
  teacher_name: string;
  section: string;
}

interface ScheduleRow extends RowDataPacket {
  id: number;
  teacher_id: number;
  subject: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room: string;
  teacher_name: string;
  created_at: string;
  section: string;
}

interface PrincipalRow extends RowDataPacket {
  id: number;
  name: string;
  username: string;
  password: string;
  email: string;
  contact: string;
  photo: string | null;
}

interface GuardianRow extends RowDataPacket {
  id: number;
  student_id: number;
  role: string;
  name: string;
  contact_number: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s: string) => s?.toLowerCase().replace(/[-_\s]/g, '') ?? '';

/** Returns today's date string in YYYY-MM-DD using PH local time (UTC+8) */
const getPHDateStr = (): string => {
  const now = new Date();
  const phOffset = 8 * 60;
  const ph = new Date(now.getTime() + (phOffset - now.getTimezoneOffset()) * 60_000);
  return ph.toISOString().slice(0, 10);
};

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────

export const getOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    const today = getPHDateStr();

    const [teachers, students, todayRecords] = await Promise.all([
      query<TeacherRow[]>('SELECT id, name, section FROM teachers ORDER BY section'),
      query<RowDataPacket[]>('SELECT id, teacher_id FROM students'),
      query<AttendanceRow[]>('SELECT status, teacher_id FROM attendance WHERE date = ?', [today]),
    ]);

    const sections = teachers.map(t => {
      const sectionStudents = students.filter(s => s.teacher_id === t.id);
      const att = todayRecords.filter(r => r.teacher_id === t.id);
      return {
        teacher_id:   t.id,
        teacher_name: t.name,
        section:      t.section,
        total:        sectionStudents.length,
        present: att.filter(r => norm(r.status) === 'present').length,
        absent:  att.filter(r => norm(r.status) === 'absent').length,
        late:    att.filter(r => norm(r.status) === 'late').length,
        dropoff: att.filter(r => ['dropoff', 'drop-off'].includes(norm(r.status))).length,
        pickup:  att.filter(r => ['pickup',  'pick-up'].includes(norm(r.status))).length,
      };
    });

    const totals = {
      totalStudents: students.length,
      totalTeachers: teachers.length,
      present: todayRecords.filter(r => norm(r.status) === 'present').length,
      absent:  todayRecords.filter(r => norm(r.status) === 'absent').length,
      late:    todayRecords.filter(r => norm(r.status) === 'late').length,
      dropoff: todayRecords.filter(r => ['dropoff', 'drop-off'].includes(norm(r.status))).length,
      pickup:  todayRecords.filter(r => ['pickup',  'pick-up'].includes(norm(r.status))).length,
      date:    today,
    };

    res.json({ totals, sections });
  } catch (err) {
    console.error('[principal] getOverview:', err);
    res.status(500).json({ message: 'Failed to fetch overview.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE
// ─────────────────────────────────────────────────────────────────────────────

export const getAllAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, status, teacher_id, section, search, session } = req.query as Record<string, string>;

    let sql = `
      SELECT
        a.id, a.teacher_id, a.student_name, a.lrn, a.gender,
        a.guardian_name, a.by_whom, a.status, a.session,
        a.date, a.pickup_by, a.pickup_time, a.timestamp,
        t.name    AS teacher_name,
        t.section
      FROM attendance a
      LEFT JOIN teachers t ON t.id = a.teacher_id
      WHERE 1 = 1
    `;
    const params: any[] = [];

    if (date)       { sql += ' AND a.date = ?';                     params.push(date); }
    if (session)    { sql += ' AND a.session = ?';                  params.push(session); }
    if (teacher_id) { sql += ' AND a.teacher_id = ?';               params.push(teacher_id); }
    if (section)    { sql += ' AND t.section = ?';                  params.push(section); }
    if (status)     { sql += ' AND LOWER(a.status) LIKE ?';         params.push(`%${status.toLowerCase()}%`); }
    if (search)     {
      sql += ' AND (a.student_name LIKE ? OR a.lrn LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY a.date DESC, a.timestamp DESC';

    const rows = await query<AttendanceRow[]>(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[principal] getAllAttendance:', err);
    res.status(500).json({ message: 'Failed to fetch attendance records.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ABSENCE REPORTS
// ─────────────────────────────────────────────────────────────────────────────

export const getAllAbsences = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, teacher_id, section, search } = req.query as Record<string, string>;

    let sql = `
      SELECT
        ar.id, ar.teacher_id, ar.student_name, ar.lrn,
        ar.reason, ar.date, ar.submitted_by, ar.parent_contact,
        ar.status, ar.created_at,
        t.name    AS teacher_name,
        t.section
      FROM absence_reasons ar
      LEFT JOIN teachers t ON t.id = ar.teacher_id
      WHERE 1 = 1
    `;
    const params: any[] = [];

    if (status)     { sql += ' AND ar.status = ?';                  params.push(status); }
    if (teacher_id) { sql += ' AND ar.teacher_id = ?';              params.push(teacher_id); }
    if (section)    { sql += ' AND t.section = ?';                  params.push(section); }
    if (search)     {
      sql += ' AND (ar.student_name LIKE ? OR ar.lrn LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY ar.date DESC, ar.created_at DESC';

    const rows = await query<AbsenceRow[]>(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[principal] getAllAbsences:', err);
    res.status(500).json({ message: 'Failed to fetch absence reports.' });
  }
};

export const updateAbsenceStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body as { status: string };
    const allowed = ['approved', 'pending', 'rejected'];

    if (!allowed.includes(status)) {
      res.status(400).json({ message: 'Invalid status value.' });
      return;
    }

    await query('UPDATE absence_reasons SET status = ? WHERE id = ?', [status, id]);
    res.json({ message: 'Status updated.', id: Number(id), status });
  } catch (err) {
    console.error('[principal] updateAbsenceStatus:', err);
    res.status(500).json({ message: 'Failed to update absence status.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export const getAllEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query<EventRow[]>(`
      SELECT
        e.id, e.teacher_id, e.title, e.description,
        e.event_type, e.scheduled_at, e.location,
        e.teacher_name, e.created_at,
        t.section
      FROM events e
      LEFT JOIN teachers t ON t.id = e.teacher_id
      ORDER BY e.scheduled_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[principal] getAllEvents:', err);
    res.status(500).json({ message: 'Failed to fetch events.' });
  }
};

export const createEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title,
      description  = '',
      event_type   = 'School Event',
      scheduled_at,
      location     = '',
    } = req.body as {
      title: string;
      description?: string;
      event_type?: string;
      scheduled_at: string;
      location?: string;
    };

    if (!title || !scheduled_at) {
      res.status(400).json({ message: 'title and scheduled_at are required.' });
      return;
    }

    const result = await query<ResultSetHeader>(`
      INSERT INTO events
        (teacher_id, title, description, event_type, scheduled_at, location, teacher_name, created_at)
      VALUES (NULL, ?, ?, ?, ?, ?, 'Principal Admin', NOW())
    `, [title, description, event_type, scheduled_at, location]);

    // Notify all teachers
    const teachers = await query<RowDataPacket[]>('SELECT id FROM teachers');
    if (teachers.length) {
      const notifValues = teachers
        .map(t => `(${t.id}, 'new_event', 'A new event "${title}" has been posted by the Principal.', 0, NOW())`)
        .join(', ');
      await query(`INSERT INTO notifications (teacher_id, type, body, is_read, created_at) VALUES ${notifValues}`);
    }

    res.status(201).json({ id: result.insertId, message: 'Event created.' });
  } catch (err) {
    console.error('[principal] createEvent:', err);
    res.status(500).json({ message: 'Failed to create event.' });
  }
};

export const updateEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, event_type, scheduled_at, location } = req.body as {
      title: string;
      description: string;
      event_type: string;
      scheduled_at: string;
      location: string;
    };

    await query(`
      UPDATE events
      SET title = ?, description = ?, event_type = ?, scheduled_at = ?, location = ?
      WHERE id = ?
    `, [title, description, event_type, scheduled_at, location, id]);

    res.json({ message: 'Event updated.', id: Number(id) });
  } catch (err) {
    console.error('[principal] updateEvent:', err);
    res.status(500).json({ message: 'Failed to update event.' });
  }
};

export const deleteEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await query('DELETE FROM events WHERE id = ?', [id]);
    res.json({ message: 'Event deleted.', id: Number(id) });
  } catch (err) {
    console.error('[principal] deleteEvent:', err);
    res.status(500).json({ message: 'Failed to delete event.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TEACHERS
// ─────────────────────────────────────────────────────────────────────────────

export const getAllTeachers = async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query<TeacherRow[]>(`
      SELECT
        t.id, t.name, t.username, t.age, t.gender,
        t.section, t.contact, t.address, t.created_at,
        t.photo_base64,
        COUNT(s.id) AS student_count
      FROM teachers t
      LEFT JOIN students s ON s.teacher_id = t.id
      GROUP BY t.id
      ORDER BY t.section
    `);
    res.json(rows);
  } catch (err) {
    console.error('[principal] getAllTeachers:', err);
    res.status(500).json({ message: 'Failed to fetch teachers.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STUDENTS
// ─────────────────────────────────────────────────────────────────────────────

export const getAllStudents = async (req: Request, res: Response): Promise<void> => {
  try {
    const { teacher_id, section, search } = req.query as Record<string, string>;

    let sql = `
      SELECT
        s.id, s.teacher_id, s.lrn, s.name, s.gender, s.created_at,
        t.name    AS teacher_name,
        t.section
      FROM students s
      LEFT JOIN teachers t ON t.id = s.teacher_id
      WHERE 1 = 1
    `;
    const params: any[] = [];

    if (teacher_id) { sql += ' AND s.teacher_id = ?';              params.push(teacher_id); }
    if (section)    { sql += ' AND t.section = ?';                  params.push(section); }
    if (search)     {
      sql += ' AND (s.name LIKE ? OR s.lrn LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY t.section, s.name';

    const rows = await query<StudentRow[]>(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[principal] getAllStudents:', err);
    res.status(500).json({ message: 'Failed to fetch students.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULES
// ─────────────────────────────────────────────────────────────────────────────

export const getAllSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query<ScheduleRow[]>(`
      SELECT
        sc.id, sc.teacher_id, sc.subject, sc.day_of_week,
        sc.start_time, sc.end_time, sc.room, sc.teacher_name,
        sc.created_at,
        t.section
      FROM student_schedules sc
      LEFT JOIN teachers t ON t.id = sc.teacher_id
      ORDER BY
        FIELD(sc.day_of_week,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'),
        sc.start_time
    `);
    res.json(rows);
  } catch (err) {
    console.error('[principal] getAllSchedules:', err);
    res.status(500).json({ message: 'Failed to fetch schedules.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GUARDIANS
// ─────────────────────────────────────────────────────────────────────────────

export const getAllGuardians = async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await query<GuardianRow[]>(`
      SELECT
        pg.id,
        pg.student_id,
        pg.role,
        pg.name,
        pg.contact_number
      FROM parents_guardians pg
      ORDER BY pg.student_id, pg.id
    `);
    res.json(rows);
  } catch (err) {
    console.error('[principal] getAllGuardians:', err);
    res.status(500).json({ message: 'Failed to fetch guardians.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPAL PROFILE — get current principal info
// ─────────────────────────────────────────────────────────────────────────────

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const principalId = req.principal?.id;

    if (!principalId) {
      res.status(401).json({ message: 'Unauthorized.' });
      return;
    }

    const rows = await query<PrincipalRow[]>(
      'SELECT id, name, username, email, contact, photo FROM principals WHERE id = ? LIMIT 1',
      [principalId]
    );

    if (!rows.length) {
      res.status(404).json({ message: 'Principal not found.' });
      return;
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('[principal] getProfile:', err);
    res.status(500).json({ message: 'Failed to fetch profile.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPAL PROFILE — update name, username, photo (base64)
// ─────────────────────────────────────────────────────────────────────────────

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const principalId = req.principal?.id;

    if (!principalId) {
      res.status(401).json({ message: 'Unauthorized.' });
      return;
    }

    const { name, username, photo } = req.body as {
      name?: string;
      username?: string;
      photo?: string;
    };

    if (!name && !username && photo === undefined) {
      res.status(400).json({ message: 'Nothing to update.' });
      return;
    }

    if (username) {
      const existing = await query<RowDataPacket[]>(
        'SELECT id FROM principals WHERE username = ? AND id != ? LIMIT 1',
        [username, principalId]
      );

      if (existing.length) {
        res.status(409).json({ message: 'Username already taken.' });
        return;
      }
    }

    const fields: string[] = [];
    const params: any[] = [];

    if (name) {
      fields.push('name = ?');
      params.push(name);
    }

    if (username) {
      fields.push('username = ?');
      params.push(username);
    }

    if (photo !== undefined) {
      fields.push('photo = ?');
      params.push(photo || null);
    }

    params.push(principalId);

    await query(`UPDATE principals SET ${fields.join(', ')} WHERE id = ?`, params);

    const updated = await query<PrincipalRow[]>(
      'SELECT id, name, username, email, contact, photo FROM principals WHERE id = ? LIMIT 1',
      [principalId]
    );

    res.json({
      message: 'Profile updated.',
      principal: updated[0],
    });
  } catch (err) {
    console.error('[principal] updateProfile:', err);
    res.status(500).json({ message: 'Failed to update profile.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPAL AUTH — change password
// ─────────────────────────────────────────────────────────────────────────────

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const principalId = req.principal?.id;

    if (!principalId) {
      res.status(401).json({ message: 'Unauthorized.' });
      return;
    }

    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        message: 'currentPassword and newPassword are required.',
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        message: 'New password must be at least 6 characters.',
      });
      return;
    }

    const rows = await query<PrincipalRow[]>(
      'SELECT password FROM principals WHERE id = ? LIMIT 1',
      [principalId]
    );

    if (!rows.length) {
      res.status(404).json({ message: 'Principal not found.' });
      return;
    }

    const match = await bcrypt.compare(currentPassword, rows[0].password);

    if (!match) {
      res.status(401).json({ message: 'Current password is incorrect.' });
      return;
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await query(
      'UPDATE principals SET password = ? WHERE id = ?',
      [hashed, principalId]
    );

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('[principal] changePassword:', err);
    res.status(500).json({ message: 'Failed to change password.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPAL AUTH — login
// ─────────────────────────────────────────────────────────────────────────────

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body as {
      username: string;
      password: string;
    };

    if (!username || !password) {
      res.status(400).json({ message: 'Username and password are required.' });
      return;
    }

    const rows = await query<PrincipalRow[]>(
      'SELECT id, name, username, password, email, contact, photo FROM principals WHERE username = ? LIMIT 1',
      [username]
    );

    if (!rows.length) {
      res.status(401).json({ message: 'Invalid credentials.' });
      return;
    }

    const principal = rows[0];
    const match = await bcrypt.compare(password, principal.password);

    if (!match) {
      res.status(401).json({ message: 'Invalid credentials.' });
      return;
    }

    const token = jwt.sign(
      { id: principal.id, name: principal.name, role: 'principal' },
      process.env.JWT_SECRET as string,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      principal: {
        id:       principal.id,
        name:     principal.name,
        username: principal.username,
        email:    principal.email,
        contact:  principal.contact,
        photo:    principal.photo,
      },
    });
  } catch (err) {
    console.error('[principal] login:', err);
    res.status(500).json({ message: 'Login failed.' });
  }
};
