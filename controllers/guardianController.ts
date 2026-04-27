import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import pool from '../lib/db';
import { AuthRequest } from '../middleware/authMiddleware';

// ─── POST /api/guardians ──────────────────────────────────────────────
export async function createGuardian(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, age, address, relationship, contact, student_name, photo_base64 } = req.body;

    if (!name || !student_name) {
      res.status(400).json({ error: 'name and student_name are required' });
      return;
    }

    let photoPath: string | null = null;

    // Save base64 photo if provided
    if (photo_base64) {
      const uploadsDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const filename  = `guardian_${Date.now()}.jpg`;
      const filepath  = path.join(uploadsDir, filename);
      const buffer    = Buffer.from(photo_base64, 'base64');
      fs.writeFileSync(filepath, buffer);
      photoPath = `/uploads/${filename}`;
    }

    const [result] = await pool.execute(
      `INSERT INTO guardians (name, age, address, relationship, contact, student_name, photo_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, age || null, address || null, relationship || null,
       contact || null, student_name, photoPath]
    ) as any[];

    res.status(201).json({
      id:      (result as any).insertId,
      message: 'Guardian registered successfully',
    });
  } catch (err) {
    console.error('createGuardian error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/guardians?student_name= ────────────────────────────────
export async function getGuardians(req: Request, res: Response): Promise<void> {
  try {
    const { student_name } = req.query;

    let query  = 'SELECT * FROM guardians';
    let params: any[] = [];

    if (student_name) {
      query  += ' WHERE student_name LIKE ?';
      params  = [`%${student_name}%`];
    }

    query += ' ORDER BY created_at DESC';

    const [rows] = await pool.execute(query, params) as any[];
    res.json(rows);
  } catch (err) {
    console.error('getGuardians error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── PATCH /api/guardians/:id/status ─────────────────────────────────
export async function updateGuardianStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ['approved', 'denied', 'pending'];
    if (!status || !allowed.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
      return;
    }

    const [result] = await pool.execute(
      `UPDATE guardians SET approval_status = ?, updated_at = NOW() WHERE id = ?`,
      [status, id]
    ) as any[];

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ error: 'Guardian not found' });
      return;
    }

    res.json({ id: Number(id), approval_status: status, message: 'Status updated' });
  } catch (err) {
    console.error('updateGuardianStatus error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}