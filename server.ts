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
import smsRoutes                 from './routes/smsRoutes';
import principalRoutes           from './routes/principalRoutes';

// ─── Middleware imports ───────────────────────────────────────────────────────
import { errorHandler } from './middleware/errorMiddleware';

const app  = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// ─── Core Middleware ──────────────────────────────────────────────────────────
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
  'https://your-vercel-app.vercel.app,https://192.168.1.130:3100,https://172.20.10.14:3100/,https://192.168.222.77:3100,https://192.168.1.3:3100,https://192.168.1.13:3100,https://172.22.155.171:3100,http://localhost:5173,http://localhost:5174,http://localhost:3100,http://192.168.137.204:3100,http://192.168.x.x:3100,https://192.168.56.1:3100,http://192.168.56.x:3100,https://192.168.1.10:8081,https://192.168.1.10:3100,https://172.20.10.14:8081,https://172.20.10.14:3100,https://192.168.1.130:3100,https://192.168.1.130:5000,'
)
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
app.use('/api/teachers',    authRoutes);  // ✅ fixes PUT /api/teachers/:id and PUT /api/teachers/:id/change-password
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

app.use(express.json({ limit: '64mb' }));
app.use(express.urlencoded({ extended: true, limit: '64mb' }));
export default app;