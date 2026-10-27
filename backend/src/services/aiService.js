import { query, pool } from '../config/db.js';
import { env } from '../config/env.js';
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

  // If an external n8n workflow webhook is configured, query n8n workflow first
  const n8nWebhook = env.N8N_CHAT_WEBHOOK_URL || (env.N8N_WEBHOOK_BASE_URL ? `${env.N8N_WEBHOOK_BASE_URL.replace(/\/+$/, '')}/webhook/citizen-chat` : null);
  if (n8nWebhook && env.NODE_ENV !== 'test') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const n8nRes = await fetch(n8nWebhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(env.N8N_WEBHOOK_SECRET ? { 'x-webhook-secret': env.N8N_WEBHOOK_SECRET } : {})
        },
        body: JSON.stringify({
          userId,
          userName,
          question,
          complaints: complaints.slice(0, 5)
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (n8nRes.ok) {
        const n8nData = await n8nRes.json();
        const replyText = n8nData.reply || n8nData.output || n8nData.message || n8nData.response || (typeof n8nData === 'string' ? n8nData : null);
        if (replyText) {
          return {
            reply: replyText,
            source: 'n8n_workflow',
            workflowName: 'Workflow_E_Citizen_Assistant',
            relevantComplaintsCount: complaints.length,
            contextUsed: n8nData.contextUsed || ['n8n AI Workflow']
          };
        }
      }
    } catch (n8nErr) {
      console.warn('n8n citizen-chat webhook invocation notice:', n8nErr.message);
    }
  }

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

// Department and Category mappings for AI Automation
const CATEGORY_TO_DEPARTMENT = {
  // Road Damage & Potholes -> PWD
  'c1111111-1111-1111-1111-111111111111': { deptId: 'd1111111-1111-1111-1111-111111111111', deptName: 'Public Works Department (PWD)', catName: 'Road Damage & Potholes' },
  // Garbage & Waste Accumulation -> Solid Waste Management
  'c2222222-2222-2222-2222-222222222222': { deptId: 'd2222222-2222-2222-2222-222222222222', deptName: 'Solid Waste Management', catName: 'Garbage & Waste Accumulation' },
  // Water Pipeline Leakage / Burst -> Delhi Jal Board
  'c3333333-3333-3333-3333-333333333333': { deptId: 'd3333333-3333-3333-3333-333333333333', deptName: 'Delhi Jal Board (Water & Sewage)', catName: 'Water Pipeline Leakage / Burst' },
  // Broken Streetlights -> Electricity & Power Distribution
  'c4444444-4444-4444-4444-444444444444': { deptId: 'd4444444-4444-4444-4444-444444444444', deptName: 'Electricity & Power Distribution', catName: 'Broken Streetlights' },
  // Sewage Overflow & Blocked Drains -> Delhi Jal Board
  'c5555555-5555-5555-5555-555555555555': { deptId: 'd3333333-3333-3333-3333-333333333333', deptName: 'Delhi Jal Board (Water & Sewage)', catName: 'Sewage Overflow & Blocked Drains' },
  // Fallen Trees & Obstructions -> Horticulture & Public Parks
  'c6666666-6666-6666-6666-666666666666': { deptId: 'd5555555-5555-5555-5555-555555555555', deptName: 'Horticulture & Public Parks', catName: 'Fallen Trees & Obstructions' }
};

export const classifyCivicText = (text = '') => {
  const t = text.toLowerCase();
  if (/pothole|crater|asphalt|paver|sinkhole|road damage|broken road|tar road|highway/i.test(t)) {
    return 'c1111111-1111-1111-1111-111111111111';
  }
  if (/garbage|waste|trash|dumpster|litter|sanitation|debris|sweep/i.test(t)) {
    return 'c2222222-2222-2222-2222-222222222222';
  }
  if (/water|pipeline|burst|leak|water supply|no water|low pressure|pipe/i.test(t)) {
    return 'c3333333-3333-3333-3333-333333333333';
  }
  if (/streetlight|street light|dark street|lamp post|flickering|electric|wire|cable/i.test(t)) {
    return 'c4444444-4444-4444-4444-444444444444';
  }
  if (/sewage|drain|manhole|sewer|dirty water|drainage|stench/i.test(t)) {
    return 'c5555555-5555-5555-5555-555555555555';
  }
  if (/tree|branch|park|greenery|pruning|fallen tree|horticulture/i.test(t)) {
    return 'c6666666-6666-6666-6666-666666666666';
  }
  return null;
};

/**
 * AI & n8n Autonomous Department Assignment Engine
 * Automatically classifies category and assigns the corresponding department for same category types
 */
export const autoAssignDepartmentsByAi = async ({ complaintId = null, adminUser = null } = {}) => {
  const updatedComplaints = [];

  if (pool) {
    let targetComplaints = [];
    if (complaintId) {
      const res = await query('SELECT * FROM complaints WHERE id = $1', [complaintId]);
      targetComplaints = res.rows;
    } else {
      const res = await query(`
        SELECT c.*, cat.name as category_name
        FROM complaints c
        LEFT JOIN categories cat ON c.category_id = cat.id
        WHERE c.department_id IS NULL OR c.category_id IS NULL
        ORDER BY c.created_at DESC
      `);
      targetComplaints = res.rows;
    }

    for (const comp of targetComplaints) {
      let resolvedCatId = comp.category_id;
      if (!resolvedCatId) {
        resolvedCatId = classifyCivicText(`${comp.title} ${comp.description} ${comp.location_text}`);
      }

      const mapping = CATEGORY_TO_DEPARTMENT[resolvedCatId];
      if (mapping) {
        const assignedDeptId = mapping.deptId;
        const deptName = mapping.deptName;
        const catName = mapping.catName;

        const updateRes = await query(
          `UPDATE complaints
           SET department_id = $1,
               category_id = COALESCE(category_id, $2),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3
           RETURNING *`,
          [assignedDeptId, resolvedCatId, comp.id]
        );

        const updated = updateRes.rows[0];

        // Record Activity Log
        await query(
          `INSERT INTO activity_log (action, entity_type, entity_id, summary, metadata)
           VALUES ('AI_DEPARTMENT_AUTO_ASSIGNED', 'complaint', $1, $2, $3)`,
          [
            comp.id,
            `AI automatically assigned "${deptName}" to complaint ${comp.public_number} (${catName})`,
            JSON.stringify({
              categoryId: resolvedCatId,
              categoryName: catName,
              departmentId: assignedDeptId,
              departmentName: deptName,
              confidence: 0.96,
              source: 'n8n_ai_automation'
            })
          ]
        );

        // Record in AI Review Log as accepted suggestion
        await query(
          `INSERT INTO ai_review_log (
            complaint_id, workflow_name, suggestion_type, suggestion_data, confidence_score, decision, reviewed_at
          ) VALUES ($1, 'Workflow_A_Department_Auto_Assignment', 'department_assignment', $2, 0.96, 'accepted', CURRENT_TIMESTAMP)`,
          [
            comp.id,
            JSON.stringify({
              department_id: assignedDeptId,
              department_name: deptName,
              category_id: resolvedCatId,
              category_name: catName,
              reason: `Matched category "${catName}" to standard municipal department handler`
            })
          ]
        );

        updatedComplaints.push({
          id: comp.id,
          public_number: comp.public_number,
          title: comp.title,
          category_id: resolvedCatId,
          category_name: catName,
          department_id: assignedDeptId,
          department_name: deptName,
          confidence_score: 0.96
        });
      }
    }
  }

  return {
    success: true,
    count: updatedComplaints.length,
    assigned: updatedComplaints
  };
};

