import express from 'express';
import { env } from '../config/env.js';
import { testConnection } from '../config/db.js';

const router = express.Router();

/**
 * @route   GET /api/health (and /health)
 * @desc    Health check endpoint for Render and uptime monitoring
 * @access  Public
 */
router.get('/', async (req, res) => {
  const memory = process.memoryUsage();
  const dbStatus = await testConnection();
  
  res.status(200).json({
    status: 'healthy',
    service: 'nagar-drishti-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    database: {
      connected: dbStatus.connected,
      message: dbStatus.message
    },
    memory: {
      rssMB: Math.round(memory.rss / 1024 / 1024),
      heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
      heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024)
    }
  });
});

export default router;
