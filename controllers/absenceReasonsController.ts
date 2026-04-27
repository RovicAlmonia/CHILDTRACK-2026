import { Request, Response } from 'express';
import pool from '../lib/db';

export async function submitAbsenceReason(req: Request, res: Response): Promise<void> {
  try {
    const { student_name, lrn, reason, date, submitted_by, parent_contact } = req.body;
    if (!student_name || !reason || !date) {
      res.status(400).json({ error: 'student_name, reason, and date are required' });
      return;
    }
    const [result] = await pool.execute(
      `INSERT INTO absence_reasons (student_name, lrn, reason, date, submitted_by, parent_contact)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [student_name, lrn || null, reason, date, submitted_by || null, parent_contact || null]
    ) as any[];
    res.status(201).json({ id: (result as any).insertId, message: 'Absence reason submitted' });
  } catch (err) {
    console.error('submitAbsenceReason error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getAbsenceReasons(req: Request, res: Response): Promise<void> {
  try {
    const { student_name } = req.query;
    let query = 'SELECT * FROM absence_reasons';
    const params: any[] = [];
    if (student_name) {
      query += ' WHERE student_name LIKE ?';
      params.push(`%${student_name}%`);
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.execute(query, params) as any[];
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function updateAbsenceReasonStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await pool.execute('UPDATE absence_reasons SET status = ? WHERE id = ?', [status, id]);
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}