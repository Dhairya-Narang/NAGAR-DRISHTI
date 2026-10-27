import { query, pool } from '../config/db.js';
import { assignDepartment } from './adminService.js';
import { getComplaintsByCitizen } from './complaintService.js';
import { createNotification } from './notificationService.js';

// In-memory fallback stores
const mockAiReviews = new Map();
let mockAiSeq = 1;

/**
 * Save an incoming AI suggestion from n8n (Workflow A, B, or D)
 */
export const saveAiSuggestion = async ({
  complaintId,
  workflowName,
  suggestionType,
  suggestionData,
  confidenceScore = 0.85
}) => {
  if (pool) {
    const res = await query(
      `INSERT INTO ai_review_log (
        complaint_id, workflow_name, suggestion_type, suggestion_data, confidence_score, decision
      ) VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING *`,
      [complaintId, workflowName, suggestionType, JSON.stringify(suggestionData), confidenceScore]
    );
    const suggestion = res.rows[0];

    // Fetch complaint public number for notification
    const compRes = await query('SELECT public_number, reporter_user_id FROM complaints WHERE id = $1', [complaintId]);
    const publicNum = compRes.rows[0]?.public_number || 'N/A';

    // Record activity
    await query(
      `INSERT INTO activity_log (action, entity_type, entity_id, summary, metadata)
       VALUES ('AI_SUGGESTION_GENERATED', 'complaint', $1, $2, $3)`,
      [
        complaintId,
        `n8n AI generated ${suggestionType} for complaint ${publicNum} (Confidence: ${Math.round(confidenceScore * 100)}%)`,
        JSON.stringify({ workflowName, suggestionType, confidenceScore })
      ]
    );

    return suggestion;
  } else {
    const suggestion = {
      id: `ai-${Date.now()}-${mockAiSeq++}`,
      complaint_id: complaintId,
      workflow_name: workflowName,
      suggestion_type: suggestionType,
      suggestion_data: suggestionData,
      confidence_score: confidenceScore,
      decision: 'pending',
      reviewer_user_id: null,
      feedback_notes: null,
      created_at: new Date().toISOString(),
      reviewed_at: null
    };

    mockAiReviews.set(suggestion.id, suggestion);
    return suggestion;
  }
};

/**
 * Get all AI suggestions awaiting human review
 */
export const getPendingAiSuggestions = async () => {
  if (pool) {
    const res = await query(
      `SELECT air.*, 
              c.public_number, 
              c.title as complaint_title, 
              c.status as complaint_status,
              c.priority as current_priority,
              d.name as current_department_name
       FROM ai_review_log air
       JOIN complaints c ON air.complaint_id = c.id
       LEFT JOIN departments d ON c.department_id = d.id
       WHERE air.decision = 'pending'
       ORDER BY air.created_at DESC`
    );
    return res.rows;
  } else {
    return Array.from(mockAiReviews.values()).filter(s => s.decision === 'pending');
  }
};

/**
 * Review an AI suggestion (Human-in-the-loop: Accepts, rejects, or modifies)
 * AI suggestions do not alter the database without this authorized approval.
 */
export const reviewAiSuggestion = async ({
  suggestionId,
  decision, // 'accepted' | 'rejected' | 'modified'
  feedbackNotes = null,
  adminUser
}) => {
  if (!['accepted', 'rejected', 'modified'].includes(decision)) {
    const err = new Error("Invalid decision. Must be 'accepted', 'rejected', or 'modified'.");
    err.statusCode = 400;
    throw err;
  }

  let suggestion = null;
  let actionTaken = 'No change applied';

  if (pool) {
    const res = await query('SELECT * FROM ai_review_log WHERE id = $1', [suggestionId]);
    if (res.rows.length === 0) {
      const err = new Error('AI suggestion not found.');
      err.statusCode = 404;
      throw err;
    }
    suggestion = res.rows[0];

    const data = typeof suggestion.suggestion_data === 'string'
      ? JSON.parse(suggestion.suggestion_data)
      : suggestion.suggestion_data;

    // Apply change only if accepted
    if (decision === 'accepted') {
      if (suggestion.suggestion_type === 'department_suggestion' && data.department_id) {
        await assignDepartment({
          complaintId: suggestion.complaint_id,
          departmentId: data.department_id,
          adminUser,
          notes: `Accepted AI recommendation: ${data.reasoning || 'Automated classification'}`
        });
        actionTaken = `Assigned department ${data.department_id}`;
      } else if (suggestion.suggestion_type === 'priority_suggestion' && data.priority) {
        await query('UPDATE complaints SET priority = $1 WHERE id = $2', [data.priority.toLowerCase(), suggestion.complaint_id]);
        actionTaken = `Updated priority to ${data.priority}`;
      } else if (suggestion.suggestion_type === 'duplicate_flag' && data.parent_incident_id) {
        await query('UPDATE complaints SET parent_incident_id = $1 WHERE id = $2', [data.parent_incident_id, suggestion.complaint_id]);
        actionTaken = `Linked as duplicate of ${data.parent_incident_id}`;
      }
    }

    // Update review log
    const updateRes = await query(
      `UPDATE ai_review_log
       SET decision = $1,
           reviewer_user_id = $2,
           feedback_notes = $3,
           reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [decision, adminUser.id, feedbackNotes, suggestionId]
    );

    return {
      suggestion: updateRes.rows[0],
      actionTaken
    };
  } else {
    suggestion = mockAiReviews.get(suggestionId);
    if (!suggestion) {
      const err = new Error('AI suggestion not found.');
      err.statusCode = 404;
      throw err;
    }

    suggestion.decision = decision;
    suggestion.reviewer_user_id = adminUser.id;
    suggestion.feedback_notes = feedbackNotes;
    suggestion.reviewed_at = new Date().toISOString();

    if (decision === 'accepted') {
      const data = suggestion.suggestion_data;
      if (suggestion.suggestion_type === 'department_suggestion' && data.department_id) {
        actionTaken = `Assigned department ${data.department_id}`;
      } else if (suggestion.suggestion_type === 'priority_suggestion' && data.priority) {
        actionTaken = `Updated priority to ${data.priority}`;
      }
    }

    return {
      suggestion,
      actionTaken
    };
  }
};

/**
 * Handle incoming SLA breach alert from Workflow C
 */
export const handleSlaAlert = async ({ complaintId, alertType = 'sla_risk', breachHours = 0 }) => {
  if (pool) {
    const compRes = await query(
      'SELECT public_number, reporter_user_id, assigned_to_admin_id FROM complaints WHERE id = $1',
      [complaintId]
    );
    if (compRes.rows.length === 0) {
      return { success: false, message: 'Complaint not found.' };
    }
    const comp = compRes.rows[0];

    // Log SLA risk
    await query(
      `INSERT INTO activity_log (action, entity_type, entity_id, summary, metadata)
       VALUES ('SLA_ALERT_TRIGGERED', 'complaint', $1, $2, $3)`,
      [
        complaintId,
        `n8n Workflow C flagged ${alertType} on ${comp.public_number} (${breachHours}h remaining/overdue)`,
        JSON.stringify({ alertType, breachHours })
      ]
    );

    return { success: true, complaintId, publicNumber: comp.public_number };
  } else {
    return { success: true, complaintId, alertType };
  }
};

/**
 * Citizen AI Assistant (Grounded strictly in authorized FAQs and user's complaints)
 */
export const citizenAiChat = async ({ userId, userName = 'Citizen', question }) => {
  if (!question || question.trim().length === 0) {
    const err = new Error('Question cannot be empty.');
    err.statusCode = 400;
    throw err;
  }

  const cleanQ = question.trim().toLowerCase();

  // Retrieve citizen's own complaints (strict authorization barrier)
  const { complaints } = await getComplaintsByCitizen(userId, { limit: 10 });

  let reply = '';
  let contextUsed = [];

  // Match: Inquiring about their own complaints
  if (cleanQ.includes('status') || cleanQ.includes('my complaint') || cleanQ.includes('progress') || cleanQ.includes('delay') || cleanQ.includes('when')) {
    if (complaints.length === 0) {
      reply = `Hello ${userName}! You currently have no complaints on record. You can submit one anytime using the 'Report Issue' button in your portal.`;
    } else {
      const activeComplaints = complaints.filter(c => ['pending', 'in progress', 'reopened'].includes(c.status.toLowerCase()));
      if (activeComplaints.length > 0) {
        const top = activeComplaints[0];
        reply = `Hello ${userName}! Your recent complaint **${top.public_number}** ("${top.title}") is currently in **${top.status}** status. Priority is set to **${top.priority.toUpperCase()}**. Estimated resolution deadline is **${new Date(top.due_at).toLocaleDateString()}**. Our city operations team has been notified.`;
        contextUsed.push(top.public_number);
      } else {
        const last = complaints[0];
        reply = `Hello ${userName}! Your last complaint **${last.public_number}** ("${last.title}") was marked **${last.status}**. If you believe the issue was not fully fixed, you can request reopening directly from the complaint page!`;
        contextUsed.push(last.public_number);
      }
    }
  }
  // Match: Asking how to reopen
  else if (cleanQ.includes('reopen') || cleanQ.includes('not fixed') || cleanQ.includes('still broken')) {
    reply = `To reopen a complaint: Open the complaint from 'My Complaints', ensure it is marked as 'Resolved', click the 'Request Reopening' button, and provide the reason or updated photos. City operations will immediately review it in the Verification Queue.`;
    contextUsed.push('Reopening Policy');
  }
  // Match: Categories guidance
  else if (cleanQ.includes('category') || cleanQ.includes('pothole') || cleanQ.includes('garbage') || cleanQ.includes('water') || cleanQ.includes('electric') || cleanQ.includes('light')) {
    reply = `Nagar Drishti supports key categories:
1. **Road Damage & Potholes** (Public Works Dept)
2. **Garbage & Sanitation** (Solid Waste Management)
3. **Water Supply & Leakage** (Delhi Jal Board)
4. **Broken Streetlights & Electrical** (Power Distribution)
5. **Sewage Overflow & Clogged Drains** (Jal Board)
6. **Fallen Trees & Obstructions** (Horticulture)

When submitting, our AI will also assist in confirming the best department for your complaint!`;
    contextUsed.push('Civic Categories');
  }
  // Match: SLA / Timeframe guidance
  else if (cleanQ.includes('sla') || cleanQ.includes('deadline') || cleanQ.includes('how long') || cleanQ.includes('hours') || cleanQ.includes('time')) {
    reply = `Our municipal SLA service targets:
• **Urgent** (Emergency leaks, live wires): 12 Hours
• **High** (Major road craters, sewage backup): 24 Hours
• **Medium** (Streetlights, garbage heaps): 48 Hours
• **Low** (Paver tiles, minor aesthetic fixes): 96 Hours
Cases exceeding these targets are automatically escalated to senior department supervisors.`;
    contextUsed.push('SLA Targets');
  }
  // General civic assistance
  else {
    reply = `Hello ${userName}! I am the Nagar Drishti Civic Assistant. I can help you check the status of your complaints, explain civic categories, clarify SLA resolution deadlines, and guide you on submitting follow-up evidence or reopening resolved cases. How may I assist you today?`;
    contextUsed.push('General Civic FAQ');
  }

  return {
    reply,
    relevantComplaintsCount: complaints.length,
    contextUsed
  };
};
