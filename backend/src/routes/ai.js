import express from 'express';
import { citizenChat } from '../controllers/aiController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

/**
 * @route   POST /api/ai/chat
 * @desc    Citizen AI chat assistant grounded in municipal knowledge
 */
router.post('/chat', citizenChat);

export default router;
