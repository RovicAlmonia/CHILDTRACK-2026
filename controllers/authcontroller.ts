import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../lib/db';
import { signToken } from '../lib/auth';

// ─── POST /api/auth/register ──────────────────────────────────────────────────
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { name, username, password, age, gender, section, contact, address } = req.body;

    if (!name || !username || !password) {
      res.status(400).json({ error: 'Name, username, and password are required' });
      return;
    }

    const [existing] = await pool.execute(
      'SELECT id FROM teachers WHERE username = ?',
      [username]
    ) as any[];

    if ((existing as any[]).length > 0) {
      res.status(400).json({ error: 'Username already taken' });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);

    const [result] = await pool.execute(
      `INSERT INTO teachers (name, username, password, age, gender, section, contact, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, username, hashed,
       age     || null,
       gender  || null,
       section || null,
       contact || null,
       address || null]
    ) as any[];

    res.status(201).json({
      message: 'Registered successfully',
      id: (result as any).insertId,
    });
  } catch (err: any) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const [rows] = await pool.execute(
      'SELECT * FROM teachers WHERE username = ?',
      [username]
    ) as any[];

    const teacher = (rows as any[])[0];

    if (!teacher) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const match = await bcrypt.compare(password, teacher.password);
    if (!match) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const token = signToken({ id: teacher.id, username: teacher.username });

    res.json({
      token,
      teacher: {
        id:            teacher.id,
        name:          teacher.name,
        username:      teacher.username,
        section:       teacher.section,
        photo_base64:  teacher.photo_base64 ?? null,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}