import express from 'express';
import healthRouter from './health.js';
import authRouter from './auth.js';
import complaintsRouter from './complaints.js';
import adminRouter from './admin.js';

const router = express.Router();

// Root API information endpoint
router.get('/', (req, res) => {
  res.status(200).json({
    name: 'Nagar Drishti API',
    tagline: 'Har Shikayat Par Nazar. Har Samasya Ka Samadhan.',
    version: '1.0.0',
    documentation: 'See README_Nagar_Drishti.md',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      complaints: '/api/complaints',
      admin: '/api/admin',
      dashboard: '/api/dashboard (planned)',
      notifications: '/api/notifications (planned)',
      ai: '/api/ai (planned)',
      webhooks: '/api/webhooks (planned)'
    }
  });
});

// Health check endpoint
router.use('/health', healthRouter);

// Authentication & Profile routes
router.use('/auth', authRouter);

// Citizen Complaint routes
router.use('/complaints', complaintsRouter);

// Admin Operations routes
router.use('/admin', adminRouter);

export default router;
