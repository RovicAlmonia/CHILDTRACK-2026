/**
 * sf2Routes.ts
 *
 * Mount in your main app.ts / index.ts:
 *
 *   import sf2Router from './routes/sf2Routes';
 *   app.use('/api/sf2', sf2Router);
 *
 * Place this file at:  src/routes/sf2Routes.ts
 */

import { Router }              from 'express';
import multer                  from 'multer';
import path                    from 'path';
import os                      from 'os';
import { generateSF2, getSF2History } from '../controllers/sf2Controller';

/* ─── Multer — store template in OS temp dir; controller cleans it up ─── */
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max template size
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx and .xls files are accepted.'));
    }
  },
});

const router = Router();

/**
 * POST /api/sf2/generate
 * Multipart body: template_file (xlsx), month, year
 */
router.post(
  '/generate',
  upload.single('template_file'),
  generateSF2
);

/**
 * GET /api/sf2/history
 * Returns the 50 most recent SF2 generation records
 */
router.get('/history', getSF2History);

export default router;