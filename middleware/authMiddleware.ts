import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../lib/auth';

// Extend Express Request to carry the decoded teacher
export interface AuthRequest extends Request {
  teacher?: TokenPayload;
}

export function protect(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers['authorization'];

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized — no token provided' });
    return;
  }

  const token = header.slice(7);

  try {
    req.teacher = verifyToken(token);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
  }
}