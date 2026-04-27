import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../lib/db';

// ─── PUT /api/auth/:id ────────────────────────────────────────────────────────
export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, username, age, gender, section, contact, address, photo_base64 } = req.body;

    const [existing] = await pool.execute(
      'SELECT id FROM teachers WHERE username = ? AND id != ?',
      [username, id]
    ) as any[];

    if ((existing as any[]).length > 0) {
      res.status(400).json({ error: 'Username already taken by another teacher.' });
      return;
    }

    await pool.execute(
      `UPDATE teachers
       SET name = ?, username = ?, age = ?, gender = ?, section = ?,
           contact = ?, address = ?, photo_base64 = ?
       WHERE id = ?`,
      [
        name         || null,
        username     || null,
        age          || null,
        gender       || null,
        section      || null,
        contact      || null,
        address      || null,
        photo_base64 || null,
        id,
      ]
    );

    const [rows] = await pool.execute(
      'SELECT id, name, username, age, gender, section, contact, address, photo_base64 FROM teachers WHERE id = ?',
      [id]
    ) as any[];

    res.json({ message: 'Profile updated.', teacher: (rows as any[])[0] });
  } catch (err: any) {
    console.error('updateProfile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── PUT /api/auth/:id/change-password ───────────────────────────────────────
export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Both current and new password are required.' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }

    const [rows] = await pool.execute(
      'SELECT password FROM teachers WHERE id = ?',
      [id]
    ) as any[];

    const teacher = (rows as any[])[0];
    if (!teacher) {
      res.status(404).json({ error: 'Teacher not found.' });
      return;
    }

    const match = await bcrypt.compare(currentPassword, teacher.password);
    if (!match) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.execute('UPDATE teachers SET password = ? WHERE id = ?', [hashed, id]);

    res.json({ message: 'Password changed successfully.' });
  } catch (err: any) {
    console.error('changePassword error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}