import { Response } from 'express';
import pool from '../lib/db';
import { AuthRequest } from '../middleware/authMiddleware';

// ─── GET /api/attendance?date=YYYY-MM-DD ──────────────────────────────
export async function getAttendance(req: AuthRequest, res: Response): Promise<void> {
  try {
    const teacherId = req.teacher!.id;
    const date      = req.query.date as string | undefined;

    let query: string;
    let params: any[];

    if (date) {
      query = `SELECT *, DATE_FORMAT(date, '%Y-%m-%d') AS date
               FROM attendance
               WHERE teacher_id = ? AND DATE(date) = ?
               ORDER BY timestamp DESC`;
      params = [teacherId, date];
    } else {
      query = `SELECT *, DATE_FORMAT(date, '%Y-%m-%d') AS date
               FROM attendance
               WHERE teacher_id = ?
               ORDER BY timestamp DESC`;
      params = [teacherId];
    }

    const [rows] = await pool.execute(query, params) as any[];
    res.json(rows);
  } catch (err) {
    console.error('getAttendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /api/attendance ─────────────────────────────────────────────
export async function createAttendance(req: AuthRequest, res: Response): Promise<void> {
  try {
    const teacherId = req.teacher!.id;
    const {
      student_name, lrn, gender, guardian_name,
      by_whom, status, session, date, qr_data,
    } = req.body;

    if (!student_name || !status || !date) {
      res.status(400).json({ error: 'student_name, status, and date are required' });
      return;
    }

    const [existing] = await pool.execute(
      `SELECT id FROM attendance
       WHERE teacher_id = ? AND student_name = ? AND date = ? AND status = ?`,
      [teacherId, student_name, date, status]
    ) as any[];

    if ((existing as any[]).length > 0) {
      res.status(409).json({ error: 'Already recorded', already_exists: true });
      return;
    }

    const [result] = await pool.execute(
      `INSERT INTO attendance
         (teacher_id, student_name, lrn, gender, guardian_name,
          by_whom, status, session, date, qr_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        teacherId,
        student_name,
        lrn           || null,
        gender        || null,
        guardian_name || null,
        by_whom       || null,
        status,
        session       || 'AM',
        date,
        qr_data       || null,
      ]
    ) as any[];

    res.status(201).json({
      id:      (result as any).insertId,
      message: 'Attendance recorded',
    });
  } catch (err) {
    console.error('createAttendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── PATCH /api/attendance/:id ────────────────────────────────────────
export async function updateAttendance(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id }    = req.params;
    const teacherId = req.teacher!.id;

    const {
      student_name, lrn, gender, guardian_name,
      by_whom, status, session, date,
      pickup_by, pickup_time,
    } = req.body;

    const fields: string[] = [];
    const values: any[]    = [];

    // student_name: required string, save as-is
    if (student_name !== undefined) {
      fields.push('student_name = ?');
      values.push(student_name);
    }

    // FIX for all optional fields:
    // Use explicit `=== ''` check instead of falsy `|| null`.
    // The old `value || null` coercion caused "Male" / "Female" to be saved
    // correctly but an unmodified field that came in as '' (because the
    // frontend mapped null → '') would overwrite the DB value with null.
    // Now we only store null when the string is explicitly empty, and we
    // store the real value — including "Male" / "Female" — otherwise.

    if (lrn !== undefined) {
      fields.push('lrn = ?');
      values.push(lrn === '' ? null : lrn);
    }

    if (gender !== undefined) {
      fields.push('gender = ?');
      values.push(gender === '' ? null : gender);
    }

    if (guardian_name !== undefined) {
      fields.push('guardian_name = ?');
      values.push(guardian_name === '' ? null : guardian_name);
    }

    if (by_whom !== undefined) {
      fields.push('by_whom = ?');
      values.push(by_whom === '' ? null : by_whom);
    }

    // status: required enum, save as-is
    if (status !== undefined) {
      fields.push('status = ?');
      values.push(status);
    }

    // session: required enum, save as-is
    if (session !== undefined) {
      fields.push('session = ?');
      values.push(session);
    }

    // date: required, save as-is
    if (date !== undefined) {
      fields.push('date = ?');
      values.push(date);
    }

    if (pickup_by !== undefined) {
      fields.push('pickup_by = ?');
      values.push(pickup_by === '' ? null : pickup_by);
    }

    if (pickup_time !== undefined) {
      fields.push('pickup_time = ?');
      values.push(pickup_time === '' ? null : pickup_time);
    }

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(id, teacherId);

    const [result] = await pool.execute(
      `UPDATE attendance SET ${fields.join(', ')} WHERE id = ? AND teacher_id = ?`,
      values
    ) as any[];

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ error: 'Record not found or not yours' });
      return;
    }

    res.json({ message: 'Updated successfully' });
  } catch (err) {
    console.error('updateAttendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── DELETE /api/attendance/:id ───────────────────────────────────────
export async function deleteAttendance(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id }    = req.params;
    const teacherId = req.teacher!.id;

    await pool.execute(
      'DELETE FROM attendance WHERE id = ? AND teacher_id = ?',
      [id, teacherId]
    );

    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error('deleteAttendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

import { ParentAuthRequest } from '../middleware/parentAuthMiddleware';

// ─── GET /api/parent-attendance?student_name=xxx ──────────────────────
export async function getAttendanceForParent(req: ParentAuthRequest, res: Response): Promise<void> {
  try {
    const studentName = req.query.student_name as string | undefined;
    const date        = req.query.date as string | undefined;

    if (!studentName) {
      res.status(400).json({ error: 'student_name query param is required' });
      return;
    }

    let query: string;
    let params: any[];

    if (date) {
      query = `SELECT *, DATE_FORMAT(date, '%Y-%m-%d') AS date
               FROM attendance
               WHERE student_name = ? AND DATE(date) = ?
               ORDER BY timestamp DESC`;
      params = [studentName, date];
    } else {
      query = `SELECT *, DATE_FORMAT(date, '%Y-%m-%d') AS date
               FROM attendance
               WHERE student_name = ?
               ORDER BY timestamp DESC`;
      params = [studentName];
    }

    const [rows] = await pool.execute(query, params) as any[];
    res.json(rows);
  } catch (err) {
    console.error('getAttendanceForParent error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}