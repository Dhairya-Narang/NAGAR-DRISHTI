import { query, pool } from '../config/db.js';

// In-memory reference for mock fallback
let mockComplaintsRef = null;

// Helper to access mock complaints when running in memory mode
const getMockStore = async () => {
  if (!mockComplaintsRef) {
    const { getComplaintById } = await import('./complaintService.js');
    // We can also query/manage in-memory items via service
  }
};

/**
 * List complaints with administrative filtering, search, and pagination
 */
export const listAdminComplaints = async ({
  status,
  priority,
  department_id,
  category_id,
  ward,
  search,
  is_overdue,
  is_escalated,
  verification_status,
  page = 1,
  limit = 20,
  sort_by = 'created_at',
  order = 'DESC'
} = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;
  const sortCol = ['created_at', 'due_at', 'priority', 'status', 'public_number'].includes(sort_by)
    ? sort_by
    : 'created_at';
  const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  if (pool) {
    let whereClauses = [];
    let params = [];

    if (status) {
      params.push(status);
      whereClauses.push(`c.status = $${params.length}`);
    }

    if (priority) {
      params.push(priority.toLowerCase());
      whereClauses.push(`c.priority = $${params.length}`);
    }

    if (department_id) {
      params.push(department_id);
      whereClauses.push(`c.department_id = $${params.length}`);
    }

    if (category_id) {
      params.push(category_id);
      whereClauses.push(`c.category_id = $${params.length}`);
    }

    if (ward) {
      params.push(ward);
      whereClauses.push(`c.ward ILIKE $${params.length}`);
    }

    if (verification_status) {
      params.push(verification_status);
      whereClauses.push(`c.verification_status = $${params.length}`);
    }

    if (is_escalated === true || is_escalated === 'true') {
      whereClauses.push('c.is_escalated = true');
    }

    if (is_overdue === true || is_overdue === 'true') {
      whereClauses.push("c.due_at < CURRENT_TIMESTAMP AND c.status IN ('Pending', 'In Progress')");
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      whereClauses.push(
        `(c.public_number ILIKE $${pIdx} OR c.title ILIKE $${pIdx} OR c.description ILIKE $${pIdx} OR c.location_text ILIKE $${pIdx})`
      );
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const querySql = `
      SELECT c.*,
             u.name as reporter_name,
             u.email as reporter_email,
             u.phone as reporter_phone,
             cat.name as category_name,
             d.name as department_name,
             d.code as department_code,
             (c.due_at < CURRENT_TIMESTAMP AND c.status IN ('Pending', 'In Progress')) as is_overdue
      FROM complaints c
      LEFT JOIN users u ON c.reporter_user_id = u.id
      LEFT JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN departments d ON c.department_id = d.id
      ${whereSql}
      ORDER BY c.${sortCol} ${sortOrder}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const res = await query(querySql, [...params, limitNum, offset]);

    const countSql = `SELECT COUNT(*) as total FROM complaints c ${whereSql}`;
    const countRes = await query(countSql, params);
    const total = parseInt(countRes.rows[0].total, 10);

    return {
      complaints: res.rows,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  } else {
    // In-memory fallback
    const { getComplaintsByCitizen } = await import('./complaintService.js');
    // Read from the shared map by creating sample items or reading all
    let items = global.__mockComplaintsList || [];

    if (status) {
      items = items.filter(c => c.status.toLowerCase() === status.toLowerCase());
    }
    if (priority) {
      items = items.filter(c => c.priority.toLowerCase() === priority.toLowerCase());
    }
    if (department_id) {
      items = items.filter(c => c.department_id === department_id);
    }
    if (verification_status) {
      items = items.filter(c => c.verification_status === verification_status);
    }
    if (is_escalated === true || is_escalated === 'true') {
      items = items.filter(c => c.is_escalated === true);
    }
    if (is_overdue === true || is_overdue === 'true') {
      const now = new Date();
      items = items.filter(
        c => ['pending', 'in progress'].includes(c.status.toLowerCase()) && new Date(c.due_at) < now
      );
    }
    if (search && search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        c =>
          c.title?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.public_number?.toLowerCase().includes(q) ||
          c.location_text?.toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => {
      const valA = a[sortCol] || 0;
      const valB = b[sortCol] || 0;
      return sortOrder === 'ASC' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });

    const total = items.length;
    const paginated = items.slice(offset, offset + limitNum);

    return {
      complaints: paginated,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }
};

/**
 * Assign complaint to department and/or specific official
 */
export const assignDepartment = async ({
  complaintId,
  departmentId,
  assignedToAdminId = null,
  adminUser,
  notes = null
}) => {
  const noteText = notes || 'Department assigned by city operations';

  if (pool) {
    const compRes = await query('SELECT * FROM complaints WHERE id = $1', [complaintId]);
    if (compRes.rows.length === 0) {
      const err = new Error('Complaint not found.');
      err.statusCode = 404;
      throw err;
    }
    const current = compRes.rows[0];

    // Status advances to 'In Progress' if currently 'Pending'
    const newStatus = current.status === 'Pending' ? 'In Progress' : current.status;

    const updateRes = await query(
      `UPDATE complaints
       SET department_id = $1,
           assigned_to_admin_id = COALESCE($2, assigned_to_admin_id),
           status = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [departmentId, assignedToAdminId, newStatus, complaintId]
    );
    const updated = updateRes.rows[0];

    // Add status history
    await query(
      `INSERT INTO status_history (complaint_id, old_status, new_status, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [complaintId, current.status, newStatus, adminUser.id, noteText]
    );

    // Record activity log
    await query(
      `INSERT INTO activity_log (actor_id, actor_name, action, entity_type, entity_id, summary, metadata)
       VALUES ($1, $2, 'DEPARTMENT_ASSIGNED', 'complaint', $3, $4, $5)`,
      [
        adminUser.id,
        adminUser.name,
        complaintId,
        `Assigned complaint ${updated.public_number} to department`,
        JSON.stringify({ departmentId, assignedToAdminId })
      ]
    );

    // Create citizen notification
    await query(
      `INSERT INTO notifications (recipient_user_id, complaint_id, title, message, type)
       VALUES ($1, $2, 'Complaint Assigned to Department', $3, 'status_update')`,
      [
        updated.reporter_user_id,
        complaintId,
        `Your complaint ${updated.public_number} has been assigned to operations for action.`
      ]
    );

    return updated;
  } else {
    // In-memory fallback
    const { getComplaintById, updateComplaintStatus } = await import('./complaintService.js');
    const { complaint } = await getComplaintById(complaintId, adminUser);
    if (!complaint) {
      const err = new Error('Complaint not found.');
      err.statusCode = 404;
      throw err;
    }

    let result = complaint;
    if (complaint.status === 'Pending') {
      result = await updateComplaintStatus({
        complaintId,
        newStatus: 'In Progress',
        user: adminUser,
        notes: noteText
      });
    }

    result.department_id = departmentId;
    if (assignedToAdminId) result.assigned_to_admin_id = assignedToAdminId;

    return result;
  }
};

/**
 * Mark a complaint as Resolved with mandatory closure notes and optional evidence
 */
export const resolveComplaint = async ({
  complaintId,
  resolutionNotes,
  resolutionProofUrl = null,
  adminUser
}) => {
  if (!resolutionNotes || resolutionNotes.trim().length < 5) {
    const err = new Error('Resolution notes are mandatory and must be at least 5 characters long.');
    err.statusCode = 400;
    throw err;
  }

  const cleanNotes = resolutionNotes.trim();

  if (pool) {
    const compRes = await query('SELECT * FROM complaints WHERE id = $1', [complaintId]);
    if (compRes.rows.length === 0) {
      const err = new Error('Complaint not found.');
      err.statusCode = 404;
      throw err;
    }
    const current = compRes.rows[0];

    const updateRes = await query(
      `UPDATE complaints
       SET status = 'Resolved',
           verification_status = 'pending_verification',
           resolved_at = CURRENT_TIMESTAMP,
           resolution_notes = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [cleanNotes, complaintId]
    );
    const updated = updateRes.rows[0];

    // Add status history
    await query(
      `INSERT INTO status_history (complaint_id, old_status, new_status, changed_by, note)
       VALUES ($1, $2, 'Resolved', $3, $4)`,
      [complaintId, current.status, adminUser.id, cleanNotes]
    );

    // Save proof attachment if provided
    if (resolutionProofUrl) {
      await query(
        `INSERT INTO attachments (complaint_id, storage_key_or_url, file_name, file_type, attachment_kind, uploaded_by)
         VALUES ($1, $2, 'resolution_proof', 'image/jpeg', 'resolution_proof', $3)`,
        [complaintId, resolutionProofUrl, adminUser.id]
      );
    }

    // Record activity log
    await query(
      `INSERT INTO activity_log (actor_id, actor_name, action, entity_type, entity_id, summary)
       VALUES ($1, $2, 'COMPLAINT_RESOLVED', 'complaint', $3, $4)`,
      [adminUser.id, adminUser.name, complaintId, `Resolved complaint ${updated.public_number}: ${cleanNotes}`]
    );

    // Notify citizen
    await query(
      `INSERT INTO notifications (recipient_user_id, complaint_id, title, message, type)
       VALUES ($1, $2, 'Complaint Marked Resolved', $3, 'status_update')`,
      [
        updated.reporter_user_id,
        complaintId,
        `Your complaint ${updated.public_number} has been marked resolved. Please verify the resolution.`
      ]
    );

    return updated;
  } else {
    const { updateComplaintStatus, addAttachment } = await import('./complaintService.js');
    const updated = await updateComplaintStatus({
      complaintId,
      newStatus: 'Resolved',
      user: adminUser,
      notes: cleanNotes,
      verificationStatus: 'pending_verification'
    });

    if (resolutionProofUrl) {
      await addAttachment({
        complaintId,
        user: adminUser,
        file: { originalname: 'resolution_proof.jpg', mimetype: 'image/jpeg', size: 1024 },
        attachmentKind: 'resolution_proof'
      }).catch(() => {});
    }

    return updated;
  }
};

/**
 * Verify or reject complaint resolution in Verification Queue
 */
export const verifyResolution = async ({
  complaintId,
  decision, // 'verified' | 'rejected'
  verificationNotes = null,
  adminUser
}) => {
  const isVerified = decision === 'verified';
  const cleanNotes = verificationNotes
    ? verificationNotes.trim()
    : isVerified
      ? 'Resolution verified and closed by supervisor.'
      : 'Resolution rejected by supervisor. Requires rework.';

  if (pool) {
    const compRes = await query('SELECT * FROM complaints WHERE id = $1', [complaintId]);
    if (compRes.rows.length === 0) {
      const err = new Error('Complaint not found.');
      err.statusCode = 404;
      throw err;
    }
    const current = compRes.rows[0];

    const newStatus = isVerified ? 'Resolved' : 'Reopened';
    const newVStatus = isVerified ? 'verified' : 'rejected';

    const updateRes = await query(
      `UPDATE complaints
       SET status = $1,
           verification_status = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [newStatus, newVStatus, complaintId]
    );
    const updated = updateRes.rows[0];

    // Add status history
    await query(
      `INSERT INTO status_history (complaint_id, old_status, new_status, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [complaintId, current.status, newStatus, adminUser.id, cleanNotes]
    );

    // Record activity log
    await query(
      `INSERT INTO activity_log (actor_id, actor_name, action, entity_type, entity_id, summary)
       VALUES ($1, $2, $3, 'complaint', $4, $5)`,
      [
        adminUser.id,
        adminUser.name,
        isVerified ? 'RESOLUTION_VERIFIED' : 'RESOLUTION_REJECTED',
        complaintId,
        `Verification ${decision} for ${updated.public_number}: ${cleanNotes}`
      ]
    );

    return updated;
  } else {
    const { updateComplaintStatus } = await import('./complaintService.js');
    const newStatus = isVerified ? 'Resolved' : 'Reopened';
    const updated = await updateComplaintStatus({
      complaintId,
      newStatus,
      user: adminUser,
      notes: cleanNotes,
      verificationStatus: isVerified ? 'verified' : 'rejected'
    });
    return updated;
  }
};

/**
 * Escalate an overdue or critical complaint
 */
export const escalateComplaint = async ({
  complaintId,
  escalationReason,
  adminUser
}) => {
  const reasonText = escalationReason ? escalationReason.trim() : 'SLA breach escalation flagged by operations.';

  if (pool) {
    const compRes = await query('SELECT * FROM complaints WHERE id = $1', [complaintId]);
    if (compRes.rows.length === 0) {
      const err = new Error('Complaint not found.');
      err.statusCode = 404;
      throw err;
    }
    const current = compRes.rows[0];

    const updateRes = await query(
      `UPDATE complaints
       SET is_escalated = true,
           escalation_reason = $1,
           priority = 'urgent',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [reasonText, complaintId]
    );
    const updated = updateRes.rows[0];

    await query(
      `INSERT INTO status_history (complaint_id, old_status, new_status, changed_by, note)
       VALUES ($1, $2, $2, $3, $4)`,
      [complaintId, current.status, adminUser.id, `Escalated: ${reasonText}`]
    );

    await query(
      `INSERT INTO activity_log (actor_id, actor_name, action, entity_type, entity_id, summary)
       VALUES ($1, $2, 'COMPLAINT_ESCALATED', 'complaint', $3, $4)`,
      [adminUser.id, adminUser.name, complaintId, `Escalated complaint ${updated.public_number}: ${reasonText}`]
    );

    return updated;
  } else {
    const { getComplaintById } = await import('./complaintService.js');
    const { complaint } = await getComplaintById(complaintId, adminUser);
    if (!complaint) {
      const err = new Error('Complaint not found.');
      err.statusCode = 404;
      throw err;
    }

    complaint.is_escalated = true;
    complaint.escalation_reason = reasonText;
    complaint.priority = 'urgent';
    complaint.updated_at = new Date().toISOString();

    return complaint;
  }
};
