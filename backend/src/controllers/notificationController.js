import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from '../services/notificationService.js';

/**
 * @route   GET /api/notifications
 * @desc    Get user notifications with unread count
 * @access  Private (Authenticated)
 */
export const getNotifications = async (req, res, next) => {
  try {
    const { unread_only, limit } = req.query;
    const result = await getUserNotifications(req.user.id, {
      unreadOnly: unread_only,
      limit
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Mark a single notification as read
 * @access  Private (Authenticated)
 */
export const markRead = async (req, res, next) => {
  try {
    const updated = await markNotificationRead(req.params.id, req.user.id);
    res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/notifications/read-all
 * @desc    Mark all user notifications as read
 * @access  Private (Authenticated)
 */
export const markAllRead = async (req, res, next) => {
  try {
    const result = await markAllNotificationsRead(req.user.id);
    res.status(200).json({
      success: true,
      message: 'All notifications marked as read.',
      data: result
    });
  } catch (error) {
    next(error);
  }
};
