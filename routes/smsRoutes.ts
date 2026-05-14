import { Router } from 'express';
import { sendSMS, getSMSStatus, connectSMS } from '../controllers/smsController';

const router = Router();

router.post('/send',    sendSMS);
router.get('/status',   getSMSStatus);
router.post('/connect', connectSMS);   // ← ADD

export default router;