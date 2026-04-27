import express     from 'express';
import cors        from 'cors';
import helmet      from 'helmet';
import morgan      from 'morgan';
import path        from 'path';
import dotenv      from 'dotenv';
dotenv.config();

// ─── Route imports ────────────────────────────────────────────────────────────
import authRoutes                from './routes/authRoutes';
import parentRoutes              from './routes/index';
import attendanceRoutes          from './routes/attendanceRoutes';
import studentRoutes             from './routes/studentRoutes';
import guardianRoutes            from './routes/guardianRoutes';
import scanPhotoRoutes           from './routes/scanPhotoRoutes';
import sf2Routes                 from './routes/sf2Routes';
import notificationsEventsRoutes from './routes/notificationsEventsRoutes';

// ─── Middleware imports ───────────────────────────────────────────────────────
import { errorHandler } from './middleware/errorMiddleware';

const app  = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(helmet());

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Static Files ─────────────────────────────────────────────────────────────
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
app.use('/api',             parentRoutes);
app.use('/api/attendance',  attendanceRoutes);
app.use('/api/students',    studentRoutes);
app.use('/api/guardians',   guardianRoutes);
app.use('/api/scan-photos', scanPhotoRoutes);
app.use('/api/sf2',         sf2Routes);
app.use('/api',             notificationsEventsRoutes);
app.use('/api/auth',        authRoutes);
app.use('/api/teachers',    authRoutes);  // ← add this line

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 ChildTrack API running at http://localhost:${PORT}`);
});

export default app;