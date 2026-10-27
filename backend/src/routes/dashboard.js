import express from 'express';
import { getCitizenSummary } from '../controllers/dashboardController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

/**
 * @route   GET /api/dashboard/citizen-summary
 * @desc    Citizen dashboard metrics and recent complaints
 */
router.get('/citizen-summary', getCitizenSummary);

export default router;
