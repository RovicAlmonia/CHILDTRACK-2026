import { Response } from 'express';
import pool from '../lib/db';
import { AuthRequest } from '../middleware/authMiddleware';
import cloudinary from '../src/config/cloudinary';

// ─── Helper: Upload base64 image to Cloudinary ────────────────────────
async function uploadToCloudinary(base64: string, studentName: string): Promise<string> {
  const result = await cloudinary.uploader.upload(base64, {
    folder: 'childtrack/scans',
    public_id: `scan_${Date.now()}_${studentName.replace(/\s+/g, '_')}`,
    transformation: [
      { width: 800, height: 800, crop: 'limit' },
      { quality: 'auto' },
    ],
  });
  return result.secure_url;
}

// ─── POST /api/scan-photos ────────────────────────────────────────────
export async function uploadScanPhoto(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { student_name, status, photo_base64 } = req.body;

    if (!photo_base64 || !student_name) {
      res.status(400).json({ error: 'student_name and photo_base64 are required' });
      return;
    }

    const photoUrl = await uploadToCloudinary(photo_base64, student_name);

    await pool.execute(
      'INSERT INTO scan_photos (student_name, status, photo_path) VALUES (?, ?, ?)',
      [student_name, status || null, photoUrl]
    );

    res.status(201).json({ message: 'Photo saved', path: photoUrl });
  } catch (err) {
    console.error('uploadScanPhoto error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/scan-photos?student_name= ──────────────────────────────
export async function getScanPhotos(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { student_name } = req.query;
    let query = 'SELECT * FROM scan_photos';
    let params: any[] = [];

    if (student_name) {
      query  += ' WHERE student_name LIKE ?';
      params  = [`%${student_name}%`];
    }

    query += ' ORDER BY captured_at DESC LIMIT 100';

    const [rows] = await pool.execute(query, params) as any[];
    res.json(rows);
  } catch (err) {
    console.error('getScanPhotos error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
