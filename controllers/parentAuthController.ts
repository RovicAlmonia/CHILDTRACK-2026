import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../lib/db';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

export async function parentLogin(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;
    const [rows] = await pool.execute(
      'SELECT * FROM parent_accounts WHERE username = ?', [username]
    ) as any[];
    const parent = (rows as any[])[0];
    if (!parent) { res.status(401).json({ error: 'Invalid credentials' }); return; }
    const match = await bcrypt.compare(password, parent.password);
    if (!match) { res.status(401).json({ error: 'Invalid credentials' }); return; }
    const token = jwt.sign(
      { id: parent.id, username: parent.username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({
      token,
      parent: {
        id:            parent.id,
        name:          parent.name,
        username:      parent.username,
        student_name:  parent.student_name,
        lrn:           parent.lrn,
        profile_photo: parent.profile_photo,
        theme:         parent.theme,
        font_size:     parent.font_size,
        teacher_id:    parent.teacher_id,  // ← added
      },
    });
  } catch (err) {
    console.error('parentLogin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function updateParentProfile(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, profile_photo, theme, font_size } = req.body;
    await pool.execute(
      'UPDATE parent_accounts SET name = ?, profile_photo = ?, theme = ?, font_size = ? WHERE id = ?',
      [name, profile_photo || null, theme || 'dark', font_size || 'medium', id]
    );
    res.json({ message: 'Profile updated' });
  } catch (err) {
    console.error('updateParentProfile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function changeParentPassword(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { old_password, new_password } = req.body;
    const [rows] = await pool.execute(
      'SELECT * FROM parent_accounts WHERE id = ?', [id]
    ) as any[];
    const parent = (rows as any[])[0];
    if (!parent) { res.status(404).json({ error: 'Not found' }); return; }
    const match = await bcrypt.compare(old_password, parent.password);
    if (!match) { res.status(401).json({ error: 'Old password incorrect' }); return; }
    const hashed = await bcrypt.hash(new_password, 10);
    await pool.execute(
      'UPDATE parent_accounts SET password = ? WHERE id = ?', [hashed, id]
    );
    res.json({ message: 'Password changed' });
  } catch (err) {
    console.error('changeParentPassword error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}