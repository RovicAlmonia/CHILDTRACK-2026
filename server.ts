import express     from 'express';
import cors        from 'cors';
import helmet      from 'helmet';
import morgan      from 'morgan';
import path        from 'path';
import dotenv      from 'dotenv';
dotenv.config();

// ─── DB import ────────────────────────────────────────────────────────────────
import pool from './lib/db';

// ─── Route imports ────────────────────────────────────────────────────────────
import authRoutes                from './routes/authRoutes';
import parentRoutes              from './routes/index';
import attendanceRoutes          from './routes/attendanceRoutes';
import studentRoutes             from './routes/studentRoutes';
import guardianRoutes            from './routes/guardianRoutes';
import scanPhotoRoutes           from './routes/scanPhotoRoutes';
import sf2Routes                 from './routes/sf2Routes';
import notificationsEventsRoutes from './routes/notificationsEventsRoutes';
import smsRoutes                 from './routes/smsRoutes';
import principalRoutes           from './routes/principalRoutes';

// ─── Middleware imports ───────────────────────────────────────────────────────
import { errorHandler } from './middleware/errorMiddleware';

const app  = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-eval'"],
        'style-src':  ["'self'", "'unsafe-inline'"],
      },
    },
  })
);

const allowedOrigins = (
  process.env.CLIENT_ORIGIN ||
  'http://localhost:5173'
)
  .split(',')
  .map(o => o.trim());

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      /^https:\/\/childtrack-2026-teacher-web.*\.vercel\.app$/.test(origin)
    ) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(morgan('dev'));

// ─── Debug middleware — logs any 500 response body to Render console ──────────
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500) {
      console.error(`❌ 500 on ${req.method} ${req.url}:`, JSON.stringify(body));
    }
    return originalJson(body);
  };
  next();
});

app.use(express.json({ limit: '64mb' }));
app.use(express.urlencoded({ extended: true, limit: '64mb' }));

app.use(
  '/uploads',
  (_req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(path.resolve(), 'uploads')),
);

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/teachers',    authRoutes);
app.use('/api',             parentRoutes);
app.use('/api/attendance',  attendanceRoutes);
app.use('/api/students',    studentRoutes);
app.use('/api/guardians',   guardianRoutes);
app.use('/api/scan-photos', scanPhotoRoutes);
app.use('/api/sf2',         sf2Routes);
app.use('/api',             notificationsEventsRoutes);
app.use('/api/sms',         smsRoutes);
app.use('/api/principal',   principalRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── DB Test Route ────────────────────────────────────────────────────────────
app.get('/api/debug-db', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    res.json({ db: 'connected', rows });
  } catch (err: any) {
    console.error('❌ DB debug error:', err.message);
    res.status(500).json({ db: 'failed', error: err.message });
  }
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 ChildTrack API running at http://localhost:${PORT}`);
});

export default app;
