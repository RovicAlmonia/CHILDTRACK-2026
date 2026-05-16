import { Request, Response } from 'express';
import { EventEmitter } from 'events';

// ─────────────────────────────────────────
//  SERIALPORT STUB (disabled in production)
//  Replace with real import for local hardware use:
//  import { SerialPort } from 'serialport';
// ─────────────────────────────────────────
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Minimal stub so TypeScript compiles without the serialport package
type SerialPortStub = {
  isOpen:   boolean;
  open:     (cb: (err: any) => void) => void;
  close:    (cb?: (err: any) => void) => void;
  write:    (data: string, cb: (err: any) => void) => void;
  drain:    (cb: (err: any) => void) => void;
  on:       (event: string, cb: (...args: any[]) => void) => void;
};

// In production this is always null; locally swap in real SerialPort
let SerialPort: any = null;
if (!IS_PRODUCTION) {
  try {
    // Dynamic require so the module is optional
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    SerialPort = require('serialport').SerialPort;
  } catch {
    console.warn('[SMS] serialport module not found — SMS disabled');
  }
}

// ─────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────
const SMS_PORT                = process.env.SMS_SERIAL_PORT || 'COM4';
const SMS_BAUD                = parseInt(process.env.SMS_BAUD_RATE || '115200', 10);
const SMS_RESPONSE_TIMEOUT_MS = 16_000;
const PING_TIMEOUT_MS         = 1_500;
const KEEPALIVE_INTERVAL_MS   = 30_000;
const READY_WAIT_MS           = 10_000;
const RETRY_DELAY_MS          = 1_500;

// ─────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────
interface SMSJob {
  id:       number;
  number:   string;
  message:  string;
  addedAt:  Date;
  attempts: number;
  status:   'pending' | 'sent' | 'failed';
}

// ─────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────
let port:         SerialPortStub | null = null;
let portReady     = false;
let esp32Ready    = false;
let connectingNow = false;
let lineBuffer    = '';
const lineEmitter = new EventEmitter();
lineEmitter.setMaxListeners(100);

let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

const queue:     SMSJob[] = [];
let jobCounter   = 0;
let isProcessing = false;

// ─────────────────────────────────────────
//  GUARD — reject all ops if no hardware
// ─────────────────────────────────────────
function noHardware(res: Response): boolean {
  if (IS_PRODUCTION || !SerialPort) {
    res.status(503).json({ error: 'SMS via serial port is not available in production.' });
    return true;
  }
  return false;
}

// ─────────────────────────────────────────
//  LINE READER
// ─────────────────────────────────────────
function attachLineReader(p: SerialPortStub) {
  p.on('data', (chunk: Buffer) => {
    lineBuffer += chunk.toString();
    let idx: number;
    while ((idx = lineBuffer.indexOf('\n')) !== -1) {
      const line = lineBuffer.slice(0, idx).replace(/\r/g, '').trim();
      lineBuffer  = lineBuffer.slice(idx + 1);
      if (!line) continue;
      console.log(`[ESP32 <] ${line}`);
      if (line === 'READY') { esp32Ready = true; }
      lineEmitter.emit('line', line);
    }
  });
}

// ─────────────────────────────────────────
//  WAIT FOR LINE
// ─────────────────────────────────────────
function waitForLine(predicate: (l: string) => boolean, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      lineEmitter.removeListener('line', onLine);
      reject(new Error(`Timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    const onLine = (line: string) => {
      if (predicate(line)) {
        clearTimeout(timer);
        lineEmitter.removeListener('line', onLine);
        resolve(line);
      }
    };

    lineEmitter.on('line', onLine);
  });
}

// ─────────────────────────────────────────
//  WRITE
// ─────────────────────────────────────────
function writeToPort(p: SerialPortStub, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[ESP32 >] ${data.trim()}`);
    p.write(data, (err: any) => {
      if (err) return reject(err);
      p.drain((e: any) => e ? reject(e) : resolve());
    });
  });
}

// ─────────────────────────────────────────
//  PING
// ─────────────────────────────────────────
async function ping(p: SerialPortStub): Promise<boolean> {
  try {
    await writeToPort(p, 'PING\n');
    await waitForLine(l => l === 'PONG', PING_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────
//  KEEPALIVE
// ─────────────────────────────────────────
function startKeepalive(p: SerialPortStub) {
  if (keepaliveTimer) clearInterval(keepaliveTimer);
  keepaliveTimer = setInterval(async () => {
    if (!port?.isOpen || isProcessing) return;
    const ok = await ping(p);
    if (ok) {
      console.log('[SMS] 💓 Keepalive OK');
    } else {
      console.error('[SMS] 💔 Keepalive failed — marking dead');
      port = null; portReady = false; esp32Ready = false;
      clearInterval(keepaliveTimer!);
    }
  }, KEEPALIVE_INTERVAL_MS);
}

// ─────────────────────────────────────────
//  GET PORT
// ─────────────────────────────────────────
let getPortPromise: Promise<SerialPortStub> | null = null;

function getPort(): Promise<SerialPortStub> {
  if (port?.isOpen && portReady && esp32Ready) return Promise.resolve(port);
  if (connectingNow && getPortPromise) return getPortPromise;

  connectingNow = true;
  getPortPromise = _openPort().finally(() => {
    connectingNow = false;
    getPortPromise = null;
  });
  return getPortPromise;
}

function _openPort(): Promise<SerialPortStub> {
  return new Promise((resolve, reject) => {
    if (port?.isOpen) {
      port.close();
      port = null; portReady = false; esp32Ready = false;
    }

    lineBuffer = '';
    const p: SerialPortStub = new SerialPort({ path: SMS_PORT, baudRate: SMS_BAUD, autoOpen: false });

    p.open(async (err: any) => {
      if (err) { port = null; return reject(new Error(`Cannot open ${SMS_PORT}: ${err.message}`)); }

      port = p; portReady = true;
      console.log(`[SMS] ✅ Port ${SMS_PORT} opened at ${SMS_BAUD} baud`);
      attachLineReader(p);

      const alive = await ping(p);
      if (alive) {
        esp32Ready = true;
        console.log('[SMS] ✅ ESP32 alive via PING');
        startKeepalive(p);
        return resolve(p);
      }

      console.log('[SMS] ⏳ No PONG — waiting for READY...');
      try {
        await waitForLine(l => l === 'READY', READY_WAIT_MS);
        console.log('[SMS] ✅ ESP32 READY received');
        startKeepalive(p);
        resolve(p);
      } catch {
        reject(new Error(`ESP32 did not respond on ${SMS_PORT} within ${READY_WAIT_MS}ms`));
      }
    });

    p.on('error', (e: any) => {
      console.error('[SMS] Port error:', e.message);
      port = null; portReady = false; esp32Ready = false;
    });
    p.on('close', () => {
      console.warn('[SMS] Port closed');
      port = null; portReady = false; esp32Ready = false;
      if (keepaliveTimer) clearInterval(keepaliveTimer);
    });
  });
}

// ─────────────────────────────────────────
//  PRE-WARM
// ─────────────────────────────────────────
export function prewarmSMSPort(): void {
  if (IS_PRODUCTION || !SerialPort) {
    console.log('[SMS] Skipping pre-warm — production environment');
    return;
  }
  console.log('[SMS] 🔥 Pre-warming serial port...');
  getPort()
    .then(() => console.log('[SMS] 🔥 Port pre-warmed and ready'))
    .catch(err => console.warn('[SMS] 🔥 Pre-warm failed (will retry on first send):', err.message));
}

// ─────────────────────────────────────────
//  SEND ONE SMS
// ─────────────────────────────────────────
async function sendOneSMS(number: string, message: string): Promise<void> {
  const p = await getPort();
  const safeMessage = message.replace(/:/g, '；');

  await writeToPort(p, `SEND:${number}:${safeMessage}\n`);

  const result = await waitForLine(
    l => l === 'SMS_OK' || l === 'SMS_FAIL',
    SMS_RESPONSE_TIMEOUT_MS
  );

  if (result === 'SMS_FAIL') throw new Error(`ESP32 reported SMS_FAIL for ${number}`);
  console.log(`[SMS] ✅ Confirmed: ${number}`);
}

// ─────────────────────────────────────────
//  QUEUE PROCESSOR
// ─────────────────────────────────────────
async function processQueue(): Promise<void> {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  while (queue.length > 0) {
    const job = queue[0];
    console.log(`[Queue] 📤 #${job.id} → ${job.number} (attempt ${job.attempts + 1}/3)`);

    try {
      await sendOneSMS(job.number, job.message);
      job.status = 'sent';
      queue.shift();
      console.log(`[Queue] ✅ #${job.id} done. Remaining: ${queue.length}`);
    } catch (err: any) {
      job.attempts++;
      console.error(`[Queue] ❌ #${job.id} failed:`, err.message);

      if (job.attempts >= 3) {
        job.status = 'failed';
        queue.shift();
        console.error(`[Queue] 🗑️  #${job.id} dropped`);
      } else {
        console.log(`[Queue] ⏳ Retry #${job.id} in ${RETRY_DELAY_MS}ms...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  isProcessing = false;
  console.log('[Queue] 🏁 Empty');
}

// ─────────────────────────────────────────
//  ENQUEUE
// ─────────────────────────────────────────
function enqueueSMS(numbers: string[], message: string): SMSJob[] {
  const jobs = numbers.map(number => {
    const job: SMSJob = {
      id: ++jobCounter, number: number.trim(),
      message: message.trim(), addedAt: new Date(),
      attempts: 0, status: 'pending',
    };
    queue.push(job);
    console.log(`[Queue] ➕ #${job.id} → ${job.number} (queue: ${queue.length})`);
    return job;
  });
  processQueue().catch(err => console.error('[Queue] Error:', err));
  return jobs;
}

// ─────────────────────────────────────────
//  POST /api/sms/send
// ─────────────────────────────────────────
export async function sendSMS(req: Request, res: Response): Promise<void> {
  if (noHardware(res)) return;

  const { numbers, message } = req.body as { numbers: string[]; message: string };

  if (!Array.isArray(numbers) || numbers.length === 0) {
    res.status(400).json({ error: 'numbers must be a non-empty array' }); return;
  }
  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' }); return;
  }

  const validNumbers = numbers.filter(n => typeof n === 'string' && n.trim());
  if (!validNumbers.length) {
    res.status(400).json({ error: 'No valid phone numbers' }); return;
  }

  const jobs = enqueueSMS(validNumbers, message.trim());
  res.status(202).json({
    status: 'queued', queued: jobs.length,
    jobIds: jobs.map(j => j.id), queueSize: queue.length,
  });
}

// ─────────────────────────────────────────
//  GET /api/sms/status
// ─────────────────────────────────────────
export async function getSMSStatus(_req: Request, res: Response): Promise<void> {
  res.json({
    portOpen:    port?.isOpen ?? false,
    esp32Ready,
    isProcessing,
    queueSize:   queue.length,
    port:        SMS_PORT,
    baud:        SMS_BAUD,
    available:   !IS_PRODUCTION && !!SerialPort,
    pendingJobs: queue.map(j => ({
      id: j.id, number: j.number, attempts: j.attempts,
      status: j.status, addedAt: j.addedAt,
    })),
  });
}

// ─────────────────────────────────────────
//  POST /api/sms/connect
// ─────────────────────────────────────────
export async function connectSMS(_req: Request, res: Response): Promise<void> {
  if (noHardware(res)) return;

  if (port?.isOpen) {
    port.close(); port = null; portReady = false; esp32Ready = false;
    if (keepaliveTimer) clearInterval(keepaliveTimer);
  }
  try {
    await getPort();
    res.json({ connected: true, port: SMS_PORT, baud: SMS_BAUD });
  } catch (err: any) {
    res.status(503).json({ connected: false, error: err.message });
  }
}
