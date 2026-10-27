import { query, pool } from '../config/db.js';

// In-memory fallback for test/dev environments
const mockNotifications = new Map();

/**
 * Create and dispatch a notification
 */
export const createNotification = async ({
  recipientUserId,
  complaintId = null,
  title,
  message,
  type = 'status_update'
}) => {
  if (pool) {
    const res = await query(
      `INSERT INTO notifications (recipient_user_id, complaint_id, title, message, type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [recipientUserId, complaintId, title.trim(), message.trim(), type]
    );
    return res.rows[0];
  } else {
    const notif = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      recipient_user_id: recipientUserId,
      complaint_id: complaintId,
      title: title.trim(),
      message: message.trim(),
      type,
      read_at: null,
      created_at: new Date().toISOString()
    };

    const userNotifs = mockNotifications.get(recipientUserId) || [];
    userNotifs.unshift(notif);
    mockNotifications.set(recipientUserId, userNotifs);

    return notif;
  }
};

/**
 * Get all notifications for an authenticated user
 */
export const getUserNotifications = async (userId, { unreadOnly = false, limit = 50 } = {}) => {
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

  if (pool) {
    let sql = `SELECT * FROM notifications WHERE recipient_user_id = $1`;
    const params = [userId];

    if (unreadOnly === true || unreadOnly === 'true') {
      sql += ` AND read_at IS NULL`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limitNum);

    const res = await query(sql, params);

    const countRes = await query(
      `SELECT COUNT(*) as unread FROM notifications WHERE recipient_user_id = $1 AND read_at IS NULL`,
      [userId]
    );
    const unreadCount = parseInt(countRes.rows[0].unread, 10);

    return {
      notifications: res.rows,
      unreadCount
    };
  } else {
    let list = mockNotifications.get(userId) || [];
    const unreadCount = list.filter(n => !n.read_at).length;

    if (unreadOnly === true || unreadOnly === 'true') {
      list = list.filter(n => !n.read_at);
    }

    return {
      notifications: list.slice(0, limitNum),
      unreadCount
    };
  }
};

/**
 * Mark a single notification as read
 */
export const markNotificationRead = async (notificationId, userId) => {
  if (pool) {
    const res = await query(
      `UPDATE notifications
       SET read_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND recipient_user_id = $2
       RETURNING *`,
      [notificationId, userId]
    );

    if (res.rows.length === 0) {
      const err = new Error('Notification not found or unauthorized.');
      err.statusCode = 404;
      throw err;
    }

    return res.rows[0];
  } else {
    const list = mockNotifications.get(userId) || [];
    const notif = list.find(n => n.id === notificationId);

    if (!notif) {
      const err = new Error('Notification not found or unauthorized.');
      err.statusCode = 404;
      throw err;
    }

    notif.read_at = new Date().toISOString();
    return notif;
  }
};

/**
 * Mark all notifications for a user as read
 */
export const markAllNotificationsRead = async (userId) => {
  if (pool) {
    const res = await query(
      `UPDATE notifications
       SET read_at = CURRENT_TIMESTAMP
       WHERE recipient_user_id = $1 AND read_at IS NULL
       RETURNING id`,
      [userId]
    );
    return { markedReadCount: res.rowCount };
  } else {
    const list = mockNotifications.get(userId) || [];
    let count = 0;
    list.forEach(n => {
      if (!n.read_at) {
        n.read_at = new Date().toISOString();
        count++;
      }
    });
    return { markedReadCount: count };
  }
};
