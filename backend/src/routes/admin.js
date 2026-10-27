import express from 'express';
import {
  list,
  assign,
  resolve,
  verify,
  escalate,
  batchAssign,
  batchResolve,
  listStagnant,
  escalate5Days
} from '../controllers/adminController.js';
import {
  getAdminSummary,
  getActivities,
  getDepartments
} from '../controllers/dashboardController.js';
import {
  getPendingSuggestions,
  reviewSuggestion,
  autoAssignDepartments
} from '../controllers/aiController.js';
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
 * @route   GET /api/admin/ai/pending
 * @desc    Get AI suggestions awaiting review in AI Operations Centre
 */
router.get('/ai/pending', getPendingSuggestions);

/**
 * @route   POST /api/admin/ai/review/:id
 * @desc    Accept, reject, or modify an AI suggestion (Human-in-the-loop)
 */
router.post('/ai/review/:id', reviewSuggestion);

/**
 * @route   POST /api/admin/ai/auto-assign
 * @desc    Autonomous AI / n8n workflow to auto-assign departments by category
 */
router.post('/ai/auto-assign', autoAssignDepartments);

/**
 * @route   GET /api/admin/complaints/stagnant
 * @desc    Get all complaints that have passed 5+ days without response
 */
router.get('/complaints/stagnant', listStagnant);

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
 * @route   POST /api/admin/complaints/:id/escalate-5days
 * @desc    Escalate a 5-day unresponded complaint and send email to higher authorities
 */
router.post('/complaints/:id/escalate-5days', escalate5Days);


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

/**
 * @route   POST /api/admin/clusters/assign
 * @desc    Batch assign all complaints in an incident cluster
 */
router.post('/clusters/assign', batchAssign);

/**
 * @route   POST /api/admin/clusters/resolve
 * @desc    Batch resolve all complaints in an incident cluster
 */
router.post('/clusters/resolve', batchResolve);

export default router;

