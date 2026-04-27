import { Request, Response } from 'express';
import pool from '../lib/db';
import { Expo } from 'expo-server-sdk';

const expo = new Expo();

export async function getParentNotifications(req: Request, res: Response): Promise<void> {
  try {
    const { student_name, lrn } = req.query;
    let query = 'SELECT * FROM parent_notifications WHERE 1=1';
    const params: any[] = [];
    if (student_name) { query += ' AND student_name LIKE ?'; params.push(`%${student_name}%`); }
    if (lrn) { query += ' AND lrn = ?'; params.push(lrn); }
    query += ' ORDER BY created_at DESC LIMIT 100';
    const [rows] = await pool.execute(query, params) as any[];
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function markParentNotificationRead(req: Request, res: Response): Promise<void> {
  try {
    await pool.execute('UPDATE parent_notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

export async function saveExpoPushToken(req: Request, res: Response): Promise<void> {
  try {
    const { student_name, lrn, token } = req.body;
    await pool.execute(
      'UPDATE parent_accounts SET expo_push_token = ? WHERE student_name = ? OR lrn = ?',
      [token, student_name || '', lrn || '']
    );
    res.json({ message: 'Token saved' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// Call this from your attendance controller when a student arrives/departs
export async function sendPushToParent(studentName: string, title: string, body: string, type: string): Promise<void> {
  try {
    const [rows] = await pool.execute(
      'SELECT expo_push_token FROM parent_accounts WHERE student_name LIKE ?',
      [`%${studentName}%`]
    ) as any[];

    await pool.execute(
      'INSERT INTO parent_notifications (student_name, title, body, type) VALUES (?, ?, ?, ?)',
      [studentName, title, body, type]
    );

    const tokens = (rows as any[]).map(r => r.expo_push_token).filter(Boolean);
    if (!tokens.length) return;

    const messages = tokens.map(token => ({
      to: token,
      sound: 'default' as const,
      title,
      body,
      data: { type, studentName },
    }));

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch (err) {
    console.error('sendPushToParent error:', err);
  }
}

// Call this when a new event is created — notifies ALL parents
export async function notifyParentsNewEvent(
  title: string,
  description: string,
  scheduled_at: string | null,
  location: string | null,
  teacher_name: string | null
): Promise<void> {
  try {
    const dateStr = scheduled_at
      ? new Date(scheduled_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
      : '';
    const locationStr = location ? ` — 📍 ${location}` : '';
    const notifTitle = `📢 New Event: ${title}${locationStr}`;
    const notifBody  = [
      description,
      dateStr       ? `🗓 ${dateStr}`        : '',
      teacher_name  ? `by ${teacher_name}`   : '',
    ].filter(Boolean).join(' | ');

    // Get all parent accounts
    const [parents] = await pool.execute(
      'SELECT DISTINCT student_name, expo_push_token FROM parent_accounts WHERE student_name IS NOT NULL'
    ) as any[];

    const pushMessages: any[] = [];

    for (const parent of parents as any[]) {
      // Insert into parent_notifications so read state works
      await pool.execute(
        'INSERT INTO parent_notifications (student_name, title, body, type) VALUES (?, ?, ?, ?)',
        [parent.student_name, notifTitle, notifBody, 'new_event']
      );

      // Queue push if token exists
      if (parent.expo_push_token && Expo.isExpoPushToken(parent.expo_push_token)) {
        pushMessages.push({
          to: parent.expo_push_token,
          sound: 'default' as const,
          title: notifTitle,
          body: notifBody,
          data: { type: 'new_event' },
        });
      }
    }

    // Send all pushes in chunks
    const chunks = expo.chunkPushNotifications(pushMessages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch (err) {
    console.error('notifyParentsNewEvent error:', err);
  }
}