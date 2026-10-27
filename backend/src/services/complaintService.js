import { query, pool } from '../config/db.js';
import { triggerComplaintCreated, triggerComplaintReopened } from './webhookService.js';

// In-memory fallback stores for test/dev environments without a live DB
const mockComplaints = new Map();
const mockStatusHistory = new Map();
const mockAttachments = new Map();
const mockActivityLog = [];
let mockComplaintSeq = 100;

/**
 * Generate a unique civic public tracking number (e.g. ND-2026-0001)
 */
export const generatePublicNumber = async () => {
  const currentYear = new Date().getFullYear();
  const prefix = `ND-${currentYear}-`;

  if (pool) {
    const res = await query(
      `SELECT public_number FROM complaints 
       WHERE public_number LIKE $1 
       ORDER BY public_number DESC LIMIT 1`,
      [`${prefix}%`]
    );
    if (res.rows.length === 0) {
      return `${prefix}0001`;
    }
    const lastNum = res.rows[0].public_number;
    const seqPart = parseInt(lastNum.replace(prefix, ''), 10);
    const nextSeq = isNaN(seqPart) ? 1 : seqPart + 1;
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  } else {
    mockComplaintSeq += 1;
    return `${prefix}${String(mockComplaintSeq).padStart(4, '0')}`;
  }
};

/**
 * Calculate due date based on priority SLA rules
 */
export const calculateDueAt = (priority = 'medium') => {
  const slaHoursByPriority = {
    urgent: 12,
    high: 24,
    medium: 48,
    low: 96
  };
  const hours = slaHoursByPriority[priority.toLowerCase()] || 48;
  return new Date(Date.now() + hours * 3600000);
};

/**
 * Submit a new civic complaint
 */
export const createComplaint = async ({
  userId,
  userName = 'Citizen',
  title,
  description,
  category_id = null,
  department_id = null,
  location_text,
  landmark = null,
  ward = null,
  latitude = null,
  longitude = null,
  priority = 'medium'
}) => {
  const publicNumber = await generatePublicNumber();
  const dueAt = calculateDueAt(priority);

  if (pool) {
    // If department_id not specified, check if category has a default department or auto-classify
    let assignedDeptId = department_id;
    let resolvedCatId = category_id;
    if (!resolvedCatId) {
      const combined = `${title} ${description} ${location_text}`.toLowerCase();
      if (/pothole|crater|asphalt|paver|sinkhole|road damage|broken road/i.test(combined)) resolvedCatId = 'c1111111-1111-1111-1111-111111111111';
      else if (/garbage|waste|trash|dumpster|litter|sanitation/i.test(combined)) resolvedCatId = 'c2222222-2222-2222-2222-222222222222';
      else if (/water|pipeline|burst|leak|water supply/i.test(combined)) resolvedCatId = 'c3333333-3333-3333-3333-333333333333';
      else if (/streetlight|street light|dark street|lamp post|flickering/i.test(combined)) resolvedCatId = 'c4444444-4444-4444-4444-444444444444';
      else if (/sewage|drain|manhole|sewer|dirty water/i.test(combined)) resolvedCatId = 'c5555555-5555-5555-5555-555555555555';
      else if (/tree|branch|park|greenery|pruning/i.test(combined)) resolvedCatId = 'c6666666-6666-6666-6666-666666666666';
    }

    if (!assignedDeptId && resolvedCatId) {
      const catRes = await query('SELECT default_department_id FROM categories WHERE id = $1', [resolvedCatId]);
      if (catRes.rows.length > 0) {
        assignedDeptId = catRes.rows[0].default_department_id;
      }
    }

    const complaintRes = await query(
      `INSERT INTO complaints (
        public_number, reporter_user_id, title, description,
        category_id, department_id, location_text, landmark, ward,
        latitude, longitude, priority, status, verification_status, due_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Pending', 'unverified', $13)
      RETURNING *`,
      [
        publicNumber, userId, title.trim(), description.trim(),
        resolvedCatId || category_id, assignedDeptId, location_text.trim(), landmark, ward,
        latitude, longitude, priority.toLowerCase(), dueAt
      ]
    );
    const complaint = complaintRes.rows[0];

    // Create initial status history entry
    await query(
      `INSERT INTO status_history (complaint_id, old_status, new_status, changed_by, note)
       VALUES ($1, NULL, 'Pending', $2, 'Complaint submitted by citizen')`,
      [complaint.id, userId]
    );

    // Record activity log
    await query(
      `INSERT INTO activity_log (actor_id, actor_name, action, entity_type, entity_id, summary)
       VALUES ($1, $2, 'COMPLAINT_CREATED', 'complaint', $3, $4)`,
      [userId, userName, complaint.id, `Submitted complaint ${publicNumber}: ${title}`]
    );

    // Trigger n8n Workflows A & B asynchronously
    triggerComplaintCreated(complaint).catch(err =>
      console.warn('Background n8n webhook error on complaint creation:', err.message)
    );

    return complaint;
  } else {
    // In-memory fallback
    const complaintId = `c-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const complaint = {
      id: complaintId,
      public_number: publicNumber,
      reporter_user_id: userId,
      reporter_name: userName,
      title: title.trim(),
      description: description.trim(),
      category_id,
      department_id,
      location_text: location_text.trim(),
      landmark,
      ward,
      latitude,
      longitude,
      priority: priority.toLowerCase(),
      status: 'Pending',
      verification_status: 'unverified',
      due_at: dueAt.toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockComplaints.set(complaintId, complaint);
    global.__mockComplaintsList ??= [];
    global.__mockComplaintsList.push(complaint);

    const initialHistory = [{
      id: `sh-${Date.now()}`,
      complaint_id: complaintId,
      old_status: null,
      new_status: 'Pending',
      changed_by: userId,
      note: 'Complaint submitted by citizen',
      timestamp: new Date().toISOString()
    }];
    mockStatusHistory.set(complaintId, initialHistory);

    mockActivityLog.push({
      id: `act-${Date.now()}`,
      actor_id: userId,
      actor_name: userName,
      action: 'COMPLAINT_CREATED',
      entity_type: 'complaint',
      entity_id: complaintId,
      summary: `Submitted complaint ${publicNumber}: ${title}`,
      timestamp: new Date().toISOString()
    });

    triggerComplaintCreated(complaint).catch(() => {});
    return complaint;
  }
};

/**
 * Get all complaints submitted by the authenticated citizen
 */
export const getComplaintsByCitizen = async (userId, { status, page = 1, limit = 20 } = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  if (pool) {
    let queryText = `
      SELECT c.*, 
             cat.name as category_name, 
             d.name as department_name, 
             d.code as department_code
      FROM complaints c
      LEFT JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN departments d ON c.department_id = d.id
      WHERE c.reporter_user_id = $1
    `;
    const params = [userId];

    if (status) {
      params.push(status);
      queryText += ` AND c.status = $${params.length}`;
    }

    queryText += ` ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limitNum, offset);

    const res = await query(queryText, params);

    const countRes = await query(
      `SELECT COUNT(*) as total FROM complaints WHERE reporter_user_id = $1 ${status ? 'AND status = $2' : ''}`,
      status ? [userId, status] : [userId]
    );
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
    let items = Array.from(mockComplaints.values()).filter(c => c.reporter_user_id === userId);
    if (status) {
      items = items.filter(c => c.status.toLowerCase() === status.toLowerCase());
    }
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

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
 * Get complaint details with timeline & attachments (enforcing role ownership barrier)
 */
export const getComplaintById = async (idOrPublicNumber, user) => {
  let complaint = null;
  let timeline = [];
  let attachments = [];
  let aiReviews = [];

  if (pool) {
    const res = await query(
      `SELECT c.*, 
              u.name as reporter_name,
              u.email as reporter_email,
              u.phone as reporter_phone,
              cat.name as category_name, 
              d.name as department_name, 
              d.code as department_code
       FROM complaints c
       LEFT JOIN users u ON c.reporter_user_id = u.id
       LEFT JOIN categories cat ON c.category_id = cat.id
       LEFT JOIN departments d ON c.department_id = d.id
       WHERE c.id::text = $1 OR c.public_number = $1`,
      [idOrPublicNumber]
    );

    if (res.rows.length === 0) return null;
    complaint = res.rows[0];

    // Enforce role barrier: Citizens can only access their own complaints
    if (user.role === 'citizen' && complaint.reporter_user_id !== user.id) {
      const err = new Error('Access denied: You are not authorized to view complaints submitted by another citizen.');
      err.statusCode = 403;
      throw err;
    }

    // Fetch timeline
    const timelineRes = await query(
      `SELECT sh.*, u.name as changed_by_name, u.role as changed_by_role
       FROM status_history sh
       LEFT JOIN users u ON sh.changed_by = u.id
       WHERE sh.complaint_id = $1
       ORDER BY sh.timestamp ASC`,
      [complaint.id]
    );
    timeline = timelineRes.rows;

    // Fetch attachments
    const attachRes = await query(
      `SELECT * FROM attachments WHERE complaint_id = $1 ORDER BY uploaded_at ASC`,
      [complaint.id]
    );
    attachments = attachRes.rows;

    // Fetch AI reviews (Admins only)
    if (user.role === 'admin') {
      const aiRes = await query(
        `SELECT * FROM ai_review_log WHERE complaint_id = $1 ORDER BY created_at DESC`,
        [complaint.id]
      );
      aiReviews = aiRes.rows;
    }
  } else {
    // In-memory fallback
    for (const c of mockComplaints.values()) {
      if (c.id === idOrPublicNumber || c.public_number === idOrPublicNumber) {
        complaint = { ...c };
        break;
      }
    }

    if (!complaint) return null;

    if (user.role === 'citizen' && complaint.reporter_user_id !== user.id) {
      const err = new Error('Access denied: You are not authorized to view complaints submitted by another citizen.');
      err.statusCode = 403;
      throw err;
    }

    timeline = mockStatusHistory.get(complaint.id) || [];
    attachments = mockAttachments.get(complaint.id) || [];
  }

  return { complaint, timeline, attachments, aiReviews };
};

/**
 * Add an attachment to a complaint
 */
export const addAttachment = async ({
  complaintId,
  user,
  file,
  attachmentKind = 'complaint_evidence'
}) => {
  const { complaint } = await getComplaintById(complaintId, user);
  if (!complaint) {
    const err = new Error('Complaint not found.');
    err.statusCode = 404;
    throw err;
  }

  // Simulated storage URL (or data URI/file link)
  const storageKey = `attachments/${complaint.id}/${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
  const fileUrl = `/uploads/${storageKey}`;

  if (pool) {
    const res = await query(
      `INSERT INTO attachments (
        complaint_id, storage_key_or_url, file_name, file_type, file_size_bytes, attachment_kind, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        complaint.id, fileUrl, file.originalname, file.mimetype,
        file.size, attachmentKind, user.id
      ]
    );
    return res.rows[0];
  } else {
    const attachment = {
      id: `att-${Date.now()}`,
      complaint_id: complaint.id,
      storage_key_or_url: fileUrl,
      file_name: file.originalname,
      file_type: file.mimetype,
      file_size_bytes: file.size,
      attachment_kind: attachmentKind,
      uploaded_by: user.id,
      uploaded_at: new Date().toISOString()
    };

    const list = mockAttachments.get(complaint.id) || [];
    list.push(attachment);
    mockAttachments.set(complaint.id, list);

    return attachment;
  }
};

/**
 * Reopen a resolved complaint when citizen disputes resolution (Workflow D)
 */
export const reopenComplaint = async ({ complaintId, user, reason }) => {
  const { complaint } = await getComplaintById(complaintId, user);
  if (!complaint) {
    const err = new Error('Complaint not found.');
    err.statusCode = 404;
    throw err;
  }

  // Lifecycle check: only 'Resolved' complaints can be reopened
  if (complaint.status !== 'Resolved') {
    const err = new Error(
      `Cannot reopen complaint with current status '${complaint.status}'. Only 'Resolved' complaints can be reopened.`
    );
    err.statusCode = 400;
    throw err;
  }

  const reopeningNote = reason ? reason.trim() : 'Resolution disputed by citizen. Issue persists.';

  if (pool) {
    const res = await query(
      `UPDATE complaints 
       SET status = 'Reopened', 
           verification_status = 'pending_verification',
           reopened_at = CURRENT_TIMESTAMP,
           reopening_reason = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [reopeningNote, complaint.id]
    );
    const updated = res.rows[0];

    // Add status history entry
    await query(
      `INSERT INTO status_history (complaint_id, old_status, new_status, changed_by, note)
       VALUES ($1, 'Resolved', 'Reopened', $2, $3)`,
      [complaint.id, user.id, reopeningNote]
    );

    // Record activity log
    await query(
      `INSERT INTO activity_log (actor_id, actor_name, action, entity_type, entity_id, summary)
       VALUES ($1, $2, 'COMPLAINT_REOPENED', 'complaint', $3, $4)`,
      [user.id, user.name, complaint.id, `Reopened complaint ${complaint.public_number}: ${reopeningNote}`]
    );

    // Trigger n8n Workflow D
    triggerComplaintReopened(updated, reopeningNote).catch(err =>
      console.warn('Background n8n webhook error on complaint reopening:', err.message)
    );

    return updated;
  } else {
    complaint.status = 'Reopened';
    complaint.verification_status = 'pending_verification';
    complaint.reopened_at = new Date().toISOString();
    complaint.reopening_reason = reopeningNote;
    complaint.updated_at = new Date().toISOString();

    const history = mockStatusHistory.get(complaint.id) || [];
    history.push({
      id: `sh-${Date.now()}`,
      complaint_id: complaint.id,
      old_status: 'Resolved',
      new_status: 'Reopened',
      changed_by: user.id,
      note: reopeningNote,
      timestamp: new Date().toISOString()
    });
    mockStatusHistory.set(complaint.id, history);

    mockActivityLog.push({
      id: `act-${Date.now()}`,
      actor_id: user.id,
      actor_name: user.name,
      action: 'COMPLAINT_REOPENED',
      entity_type: 'complaint',
      entity_id: complaint.id,
      summary: `Reopened complaint ${complaint.public_number}: ${reopeningNote}`,
      timestamp: new Date().toISOString()
    });

    triggerComplaintReopened(complaint, reopeningNote).catch(() => {});
    return complaint;
  }
};

/**
 * Update complaint status with audit logging (e.g. In Progress, Resolved)
 */
export const updateComplaintStatus = async ({
  complaintId,
  newStatus,
  user,
  notes = null,
  verificationStatus = null
}) => {
  if (pool) {
    const existingRes = await query('SELECT * FROM complaints WHERE id = $1', [complaintId]);
    if (existingRes.rows.length === 0) {
      const err = new Error('Complaint not found.');
      err.statusCode = 404;
      throw err;
    }
    const current = existingRes.rows[0];

    const isResolved = newStatus === 'Resolved';
    const resolvedAt = isResolved ? new Date() : current.resolved_at;
    const vStatus = verificationStatus || (isResolved ? 'pending_verification' : current.verification_status);

    const updateRes = await query(
      `UPDATE complaints
       SET status = $1,
           verification_status = $2,
           resolved_at = $3,
           resolution_notes = COALESCE($4, resolution_notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [newStatus, vStatus, resolvedAt, notes, complaintId]
    );
    const updated = updateRes.rows[0];

    await query(
      `INSERT INTO status_history (complaint_id, old_status, new_status, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [complaintId, current.status, newStatus, user.id, notes]
    );

    return updated;
  } else {
    const complaint = mockComplaints.get(complaintId);
    if (!complaint) {
      const err = new Error('Complaint not found.');
      err.statusCode = 404;
      throw err;
    }

    const oldStatus = complaint.status;
    complaint.status = newStatus;
    if (verificationStatus) {
      complaint.verification_status = verificationStatus;
    }
    if (newStatus === 'Resolved') {
      complaint.resolved_at = new Date().toISOString();
      complaint.resolution_notes = notes || 'Resolved by city operations';
      if (!verificationStatus) {
        complaint.verification_status = 'pending_verification';
      }
    }
    complaint.updated_at = new Date().toISOString();

    const history = mockStatusHistory.get(complaint.id) || [];
    history.push({
      id: `sh-${Date.now()}`,
      complaint_id: complaint.id,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: user.id,
      note: notes,
      timestamp: new Date().toISOString()
    });
    mockStatusHistory.set(complaint.id, history);

    return complaint;
  }
};
