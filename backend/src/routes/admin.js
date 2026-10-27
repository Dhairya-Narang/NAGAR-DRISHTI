import express from 'express';
import {
  list,
  assign,
  resolve,
  verify,
  escalate
} from '../controllers/adminController.js';
import {
  getAdminSummary,
  getActivities,
  getDepartments
} from '../controllers/dashboardController.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// All Admin Operations require authentication AND admin role
router.use(authenticateToken);
router.use(authorizeRoles('admin'));

/**
 * @route   GET /api/admin/dashboard-summary
 * @desc    Get real-time municipal dashboard summary counts & metrics
 */
router.get('/dashboard-summary', getAdminSummary);

/**
 * @route   GET /api/admin/activities
 * @desc    Get paginated municipal activity log
 */
router.get('/activities', getActivities);

/**
 * @route   GET /api/admin/departments
 * @desc    Get all active municipal departments
 */
router.get('/departments', getDepartments);

/**
 * @route   GET /api/admin/complaints
 * @desc    Filter and search complaints across the municipality
 */
router.get('/complaints', list);

/**
 * @route   POST /api/admin/complaints/:id/assign
 * @desc    Assign complaint to department
 */
router.post('/complaints/:id/assign', assign);

/**
 * @route   POST /api/admin/complaints/:id/resolve
 * @desc    Mark complaint as resolved
 */
router.post('/complaints/:id/resolve', resolve);

/**
 * @route   POST /api/admin/complaints/:id/verify
 * @desc    Verify or reject complaint resolution
 */
router.post('/complaints/:id/verify', verify);

/**
 * @route   POST /api/admin/complaints/:id/escalate
 * @desc    Escalate complaint
 */
router.post('/complaints/:id/escalate', escalate);

export default router;
