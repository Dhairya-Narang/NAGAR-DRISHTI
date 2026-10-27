import express from 'express';
import {
  getNotifications,
  markRead,
  markAllRead
} from '../controllers/notificationController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

/**
 * @route   GET /api/notifications
 * @desc    Get user notifications
 */
router.get('/', getNotifications);

/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Mark single notification as read
 */
router.patch('/:id/read', markRead);

/**
 * @route   PATCH /api/notifications/read-all
 * @desc    Mark all user notifications as read
 */
router.patch('/read-all', markAllRead);

export default router;
