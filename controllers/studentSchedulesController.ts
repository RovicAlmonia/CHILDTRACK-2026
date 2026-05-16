import { Request, Response } from 'express';
import pool from '../lib/db';

// ─── GET /api/student-schedules ───────────────────────────────
export async function getStudentSchedules(req: Request, res: Response): Promise<void> {
  try {
    const { student_name, lrn, teacher_id } = req.query;

    let query = 'SELECT * FROM student_schedules WHERE 1=1';
    const params: any[] = [];

    if (teacher_id) {
      query += ' AND teacher_id = ?';
      params.push(teacher_id);
    }
    if (student_name) {
      query += ' AND student_name LIKE ?';
      params.push(`%${student_name}%`);
    }
    if (lrn) {
      query += ' AND lrn = ?';
      params.push(lrn);
    }

    query += ' ORDER BY FIELD(day_of_week,"Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"), start_time';

    const [rows] = await pool.execute(query, params) as any[];
    res.json(rows);
  } catch (err: any) {
    console.error('getStudentSchedules error:', err);
    res.status(500).json({ error: err.message, code: err.code, sql: err.sql });
  }
}

// ─── POST /api/student-schedules ──────────────────────────────
export async function createStudentSchedule(req: Request, res: Response): Promise<void> {
  try {
    const {
      teacher_id,
      student_name,
      lrn,
      subject,
      day_of_week,
      start_time,
      end_time,
      room,
      teacher_name,
    } = req.body;

    if (!subject || !day_of_week || !start_time || !end_time) {
      res.status(400).json({ error: 'subject, day_of_week, start_time and end_time are required' });
      return;
    }

    const [result] = await pool.execute(
      `INSERT INTO student_schedules
         (teacher_id, student_name, lrn, subject, day_of_week, start_time, end_time, room, teacher_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        teacher_id   || null,
        student_name || null,
        lrn          || null,
        subject,
        day_of_week,
        start_time,
        end_time,
        room         || null,
        teacher_name || null,
      ]
    ) as any[];

    res.status(201).json({
      id:      (result as any).insertId,
      message: 'Schedule created successfully',
    });
  } catch (err: any) {
    console.error('createStudentSchedule error:', err);
    res.status(500).json({ error: err.message, code: err.code, sql: err.sql });
  }
}

// ─── PATCH /api/student-schedules/:id ─────────────────────────
export async function updateStudentSchedule(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const {
      subject,
      day_of_week,
      start_time,
      end_time,
      room,
      teacher_name,
      student_name,
      lrn,
    } = req.body;

    if (!subject || !day_of_week || !start_time || !end_time) {
      res.status(400).json({ error: 'subject, day_of_week, start_time and end_time are required' });
      return;
    }

    const [result] = await pool.execute(
      `UPDATE student_schedules
       SET subject = ?, day_of_week = ?, start_time = ?, end_time = ?,
           room = ?, teacher_name = ?, student_name = ?, lrn = ?
       WHERE id = ?`,
      [
        subject,
        day_of_week,
        start_time,
        end_time,
        room         || null,
        teacher_name || null,
        student_name || null,
        lrn          || null,
        id,
      ]
    ) as any[];

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }

    res.json({ id: Number(id), message: 'Schedule updated successfully' });
  } catch (err: any) {
    console.error('updateStudentSchedule error:', err);
    res.status(500).json({ error: err.message, code: err.code, sql: err.sql });
  }
}

// ─── DELETE /api/student-schedules/:id ────────────────────────
export async function deleteStudentSchedule(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      'DELETE FROM student_schedules WHERE id = ?',
      [id]
    ) as any[];

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ error: 'Schedule not found' });
      return;
    }

    res.json({ id: Number(id), message: 'Schedule deleted successfully' });
  } catch (err: any) {
    console.error('deleteStudentSchedule error:', err);
    res.status(500).json({ error: err.message, code: err.code, sql: err.sql });
  }
}
