import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../lib/db';
import { AuthRequest } from '../middleware/authMiddleware';

// ─── GET /api/students ────────────────────────────────────────────────
export async function getStudents(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute(
      `SELECT
   s.id, s.lrn, s.name, s.gender, s.created_at,
   COALESCE(pa.is_active, 0) AS parent_is_active,
   GROUP_CONCAT(
     JSON_OBJECT(
       'role',           pg.role,
       'name',           pg.name,
       'contact_number', pg.contact_number
     )
     SEPARATOR '||'
   ) AS parents_guardians_raw
 FROM students s
 LEFT JOIN parents_guardians pg ON s.id = pg.student_id
 LEFT JOIN parent_accounts pa ON s.lrn = pa.lrn
 GROUP BY s.id
 ORDER BY s.name`
    ) as any[];

    const students = (rows as any[]).map((row) => ({
      id:               row.id,
      lrn:              row.lrn,
      name:             row.name,
      gender:           row.gender,
      created_at:       row.created_at,
      parents_guardians: row.parents_guardians_raw
        ? row.parents_guardians_raw
            .split('||')
            .map((item: string) => {
              try { return JSON.parse(item); }
              catch { return null; }
            })
            .filter(Boolean)
        : [],
    }));

    res.json(students);
  } catch (err) {
    console.error('getStudents error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /api/students ───────────────────────────────────────────────
export async function createStudent(req: AuthRequest, res: Response): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { lrn, name, gender, parents_guardians } = req.body;

    if (!lrn || !name || !gender) {
      res.status(400).json({ error: 'lrn, name, and gender are required' });
      return;
    }

    // Insert student
    const [result] = await conn.execute(
      'INSERT INTO students (lrn, name, gender) VALUES (?, ?, ?)',
      [lrn, name, gender === 'Male' ? 'M' : gender === 'Female' ? 'F' : gender]
    ) as any[];

    const studentId = (result as any).insertId;

    // Insert each parent/guardian
    if (Array.isArray(parents_guardians)) {
      for (const pg of parents_guardians) {
        if (pg.name) {
          await conn.execute(
            `INSERT INTO parents_guardians (student_id, role, name, contact_number)
             VALUES (?, ?, ?, ?)`,
            [studentId, pg.role, pg.name, pg.contact_number || null]
          );
        }
      }
    }

    await conn.commit();

    res.status(201).json({
      id:      studentId,
      message: 'Student registered successfully',
    });
  } catch (err: any) {
    await conn.rollback();
    console.error('createStudent error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'LRN already registered' });
      return;
    }
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

// ─── GET /api/students/:id ────────────────────────────────────────────
export async function getStudentById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const [students] = await pool.execute(
      'SELECT * FROM students WHERE id = ?', [id]
    ) as any[];

    if ((students as any[]).length === 0) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }

    const [guardians] = await pool.execute(
      'SELECT * FROM parents_guardians WHERE student_id = ?', [id]
    ) as any[];

    res.json({ ...(students as any[])[0], parents_guardians: guardians });
  } catch (err) {
    console.error('getStudentById error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── PATCH /api/students/:id/activate-parent ─────────────────────────
export async function activateParentAccount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const teacherId = req.teacher?.id;

    if (!teacherId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get the student's LRN and name first
    const [students] = await pool.execute(
      'SELECT lrn, name FROM students WHERE id = ?',
      [id]
    ) as any[];

    if ((students as any[]).length === 0) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }

    const { lrn, name: studentName } = (students as any[])[0];

    // Check if parent account exists
    const [accounts] = await pool.execute(
      'SELECT id, is_active FROM parent_accounts WHERE lrn = ?',
      [lrn]
    ) as any[];

    let accountId: number;
    let newStatus: number;

    if ((accounts as any[]).length === 0) {
      // ── Get Parent 2 name from parents_guardians ─────────────────────
      const [parent2Rows] = await pool.execute(
        `SELECT name FROM parents_guardians WHERE student_id = ? AND role = 'Parent 2' LIMIT 1`,
        [id]
      ) as any[];
      const parent2Name = (parent2Rows as any[]).length > 0
        ? (parent2Rows as any[])[0].name
        : studentName; // fallback to student name if no Parent 2
      // ── Auto-create with generated credentials ───────────────────────
      const username = `parent_${lrn}`;
      const password = await bcrypt.hash(lrn, 10);
      const [result] = await pool.execute(
        `INSERT INTO parent_accounts
           (teacher_id, username, password, name, student_name, lrn,
            expo_push_token, profile_photo, theme, font_size, is_active)
         VALUES
           (?, ?, ?, ?, ?, ?, NULL, NULL, 'light', 'medium', 1)`,
        [teacherId, username, password, parent2Name, studentName, lrn]
      ) as any[];
      accountId = (result as any).insertId;
      newStatus = 1;
    } else {
      // ── Toggle existing account ──────────────────────────────────────
      const account = (accounts as any[])[0];
      accountId = account.id;
      newStatus = account.is_active ? 0 : 1;

      await pool.execute(
        'UPDATE parent_accounts SET is_active = ? WHERE id = ?',
        [newStatus, accountId]
      );
    }

    res.json({
      message:   newStatus ? 'Parent account activated' : 'Parent account deactivated',
      is_active: Boolean(newStatus),
    });
  } catch (err) {
    console.error('activateParentAccount error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}