import { env } from '../config/env.js';

/**
 * Dispatches an asynchronous HTTP webhook event to n8n workflow engine
 * @param {string} endpoint - n8n webhook sub-path or workflow trigger
 * @param {object} payload - Event payload
 */
export const dispatchN8nWebhook = async (endpoint, payload) => {
  if (!env.N8N_WEBHOOK_BASE_URL) {
    if (env.NODE_ENV === 'development') {
      console.log(`[n8n Webhook (Mock)] Dispatched to ${endpoint}:`, JSON.stringify(payload).slice(0, 150));
    }
    return { success: true, mocked: true };
  }

  const url = `${env.N8N_WEBHOOK_BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.N8N_WEBHOOK_SECRET ? { 'x-webhook-secret': env.N8N_WEBHOOK_SECRET } : {})
      },
      body: JSON.stringify({
        eventTimestamp: new Date().toISOString(),
        ...payload
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    return { success: res.ok, status: res.status };
  } catch (error) {
    console.warn(`[n8n Webhook Error] Failed to reach ${url}:`, error.message);
    // Webhook failure should never crash the user-facing API request
    return { success: false, error: error.message };
  }
};

/**
 * Trigger Workflow A (New complaint classification & department suggestion)
 * and Workflow B (Duplicate detection)
 */
export const triggerComplaintCreated = async (complaint) => {
  return dispatchN8nWebhook('complaint-created', {
    workflow: 'Workflow_A_And_B',
    complaintId: complaint.id,
    publicNumber: complaint.public_number,
    title: complaint.title,
    description: complaint.description,
    locationText: complaint.location_text,
    ward: complaint.ward,
    priority: complaint.priority,
    categoryId: complaint.category_id,
    reporterUserId: complaint.reporter_user_id
  });
};

/**
 * Trigger Workflow D (Resolution verification or reopening recommendation)
 */
export const triggerComplaintReopened = async (complaint, reason) => {
  return dispatchN8nWebhook('complaint-reopened', {
    workflow: 'Workflow_D_Verification',
    complaintId: complaint.id,
    publicNumber: complaint.public_number,
    title: complaint.title,
    reopeningReason: reason,
    previousResolutionNotes: complaint.resolution_notes,
    reopenedAt: complaint.reopened_at
  });
};
