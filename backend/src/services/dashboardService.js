import { query, pool } from '../config/db.js';
import { getUserNotifications } from './notificationService.js';
import { getComplaintsByCitizen } from './complaintService.js';

/**
 * Get Citizen Home Dashboard metrics & recent activity
 */
export const getCitizenDashboardSummary = async (userId) => {
  if (pool) {
    // Aggregated complaint counts
    const countsRes = await query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'Pending') as pending,
         COUNT(*) FILTER (WHERE status = 'In Progress') as in_progress,
         COUNT(*) FILTER (WHERE status = 'Resolved') as resolved,
         COUNT(*) FILTER (WHERE status = 'Reopened') as reopened
       FROM complaints
       WHERE reporter_user_id = $1`,
      [userId]
    );
    const counts = countsRes.rows[0];

    // Recent 5 complaints
    const recentRes = await query(
      `SELECT c.id, c.public_number, c.title, c.status, c.priority, c.created_at, c.due_at,
              cat.name as category_name, d.name as department_name
       FROM complaints c
       LEFT JOIN categories cat ON c.category_id = cat.id
       LEFT JOIN departments d ON c.department_id = d.id
       WHERE c.reporter_user_id = $1
       ORDER BY c.created_at DESC
       LIMIT 5`,
      [userId]
    );

    // Unread notifications count
    const notifRes = await query(
      `SELECT COUNT(*) as unread FROM notifications WHERE recipient_user_id = $1 AND read_at IS NULL`,
      [userId]
    );

    return {
      stats: {
        total: parseInt(counts.total, 10),
        pending: parseInt(counts.pending, 10),
        inProgress: parseInt(counts.in_progress, 10),
        resolved: parseInt(counts.resolved, 10),
        reopened: parseInt(counts.reopened, 10)
      },
      unreadNotificationsCount: parseInt(notifRes.rows[0].unread, 10),
      recentComplaints: recentRes.rows
    };
  } else {
    // In-memory fallback
    const { complaints } = await getComplaintsByCitizen(userId, { limit: 100 });
    const { unreadCount } = await getUserNotifications(userId);

    const stats = {
      total: complaints.length,
      pending: complaints.filter(c => c.status.toLowerCase() === 'pending').length,
      inProgress: complaints.filter(c => c.status.toLowerCase() === 'in progress').length,
      resolved: complaints.filter(c => c.status.toLowerCase() === 'resolved').length,
      reopened: complaints.filter(c => c.status.toLowerCase() === 'reopened').length
    };

    return {
      stats,
      unreadNotificationsCount: unreadCount,
      recentComplaints: complaints.slice(0, 5)
    };
  }
};

/**
 * Get Admin Dashboard Summary (Constraint: space prioritized for metrics, status, SLA, AI ops, no map)
 */
export const getAdminDashboardSummary = async () => {
  if (pool) {
    // Real-time aggregate status counts
    const statusRes = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'Pending') as pending,
        COUNT(*) FILTER (WHERE status = 'In Progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'Resolved') as resolved,
        COUNT(*) FILTER (WHERE status = 'Reopened') as reopened,
        COUNT(*) FILTER (WHERE due_at < CURRENT_TIMESTAMP AND status IN ('Pending', 'In Progress')) as overdue,
        COUNT(*) FILTER (WHERE is_escalated = true) as escalated,
        COUNT(*) FILTER (WHERE status = 'Resolved' AND verification_status = 'pending_verification') as verification_queue,
        COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_priority,
        COUNT(*) FILTER (WHERE priority = 'high') as high_priority,
        COUNT(*) FILTER (WHERE priority = 'medium') as medium_priority,
        COUNT(*) FILTER (WHERE priority = 'low') as low_priority
      FROM complaints
    `);
    const s = statusRes.rows[0];

    // Pending AI suggestions count
    const aiRes = await query(
      `SELECT COUNT(*) as pending_ai FROM ai_review_log WHERE decision = 'pending'`
    );
    const pendingAiSuggestions = parseInt(aiRes.rows[0].pending_ai, 10);

    // Department-wise breakdown
    const deptRes = await query(`
      SELECT 
        d.id as department_id,
        d.name as department_name,
        d.code as department_code,
        COUNT(c.id) as total_complaints,
        COUNT(c.id) FILTER (WHERE c.status IN ('Pending', 'In Progress')) as active_complaints,
        COUNT(c.id) FILTER (WHERE c.status = 'Resolved') as resolved_complaints
      FROM departments d
      LEFT JOIN complaints c ON d.id = c.department_id
      WHERE d.active = true
      GROUP BY d.id, d.name, d.code
      ORDER BY total_complaints DESC
    `);

    // Recent 5 activities
    const actRes = await query(
      `SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 5`
    );

    return {
      metrics: {
        total: parseInt(s.total, 10),
        pending: parseInt(s.pending, 10),
        inProgress: parseInt(s.in_progress, 10),
        resolved: parseInt(s.resolved, 10),
        reopened: parseInt(s.reopened, 10),
        overdue: parseInt(s.overdue, 10),
        escalated: parseInt(s.escalated, 10),
        verificationQueue: parseInt(s.verification_queue, 10),
        aiSuggestionsAwaitingReview: pendingAiSuggestions
      },
      priorityBreakdown: {
        urgent: parseInt(s.urgent_priority, 10),
        high: parseInt(s.high_priority, 10),
        medium: parseInt(s.medium_priority, 10),
        low: parseInt(s.low_priority, 10)
      },
      departmentSummary: deptRes.rows,
      recentActivities: actRes.rows
    };
  } else {
    // In-memory fallback
    const { listAdminComplaints } = await import('./adminService.js');
    const { complaints } = await listAdminComplaints({ limit: 500 });

    const total = complaints.length;
    const pending = complaints.filter(c => c.status.toLowerCase() === 'pending').length;
    const inProgress = complaints.filter(c => c.status.toLowerCase() === 'in progress').length;
    const resolved = complaints.filter(c => c.status.toLowerCase() === 'resolved').length;
    const reopened = complaints.filter(c => c.status.toLowerCase() === 'reopened').length;
    const overdue = complaints.filter(
      c => ['pending', 'in progress'].includes(c.status.toLowerCase()) && new Date(c.due_at) < new Date()
    ).length;
    const escalated = complaints.filter(c => c.is_escalated).length;
    const verificationQueue = complaints.filter(c => c.verification_status === 'pending_verification').length;

    return {
      metrics: {
        total,
        pending,
        inProgress,
        resolved,
        reopened,
        overdue,
        escalated,
        verificationQueue,
        aiSuggestionsAwaitingReview: 1
      },
      priorityBreakdown: {
        urgent: complaints.filter(c => c.priority === 'urgent').length,
        high: complaints.filter(c => c.priority === 'high').length,
        medium: complaints.filter(c => c.priority === 'medium').length,
        low: complaints.filter(c => c.priority === 'low').length
      },
      departmentSummary: [
        { department_name: 'Public Works Department (PWD)', code: 'PWD', total_complaints: 1, active_complaints: 1 },
        { department_name: 'Solid Waste Management', code: 'SWM', total_complaints: 1, active_complaints: 0 }
      ],
      recentActivities: []
    };
  }
};

/**
 * Get paginated system activity log
 */
export const getAdminActivities = async ({ page = 1, limit = 20 } = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  if (pool) {
    const res = await query(
      `SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT $1 OFFSET $2`,
      [limitNum, offset]
    );
    const countRes = await query(`SELECT COUNT(*) as total FROM activity_log`);
    const total = parseInt(countRes.rows[0].total, 10);

    return {
      activities: res.rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  } else {
    return {
      activities: [],
      pagination: { total: 0, page: pageNum, limit: limitNum, totalPages: 0 }
    };
  }
};

/**
 * Get active departments directory
 */
export const getDepartmentsList = async () => {
  if (pool) {
    const res = await query(
      `SELECT id, name, code, description, contact_email, contact_phone, active
       FROM departments
       WHERE active = true
       ORDER BY name ASC`
    );
    return res.rows;
  } else {
    return [
      { id: 'd-pwd', name: 'Public Works Department (PWD)', code: 'PWD', active: true },
      { id: 'd-swm', name: 'Solid Waste Management', code: 'SWM', active: true },
      { id: 'd-djb', name: 'Delhi Jal Board (Water & Sewage)', code: 'DJB', active: true },
      { id: 'd-power', name: 'Electricity & Power Distribution', code: 'EPD', active: true }
    ];
  }
};
