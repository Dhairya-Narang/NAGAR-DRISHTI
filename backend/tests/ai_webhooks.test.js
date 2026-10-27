import test from 'node:test';
import assert from 'node:assert';
import app from '../src/app.js';
import { generateToken } from '../src/services/authService.js';
import { createComplaint } from '../src/services/complaintService.js';

test('Phase 7: AI Assistant & n8n Workflow Webhooks', async (t) => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  const citizenUser = { id: 'u-cit-ai-test', name: 'Divya Sen', email: 'divya@example.com', role: 'citizen' };
  const adminUser = { id: 'u-adm-ai-ops', name: 'AI Operations Lead', email: 'ai.ops@nagardrishti.gov.in', role: 'admin' };

  const citizenToken = generateToken(citizenUser);
  const adminToken = generateToken(adminUser);

  // Seed complaint for citizen
  const testComplaint = await createComplaint({
    userId: citizenUser.id,
    userName: citizenUser.name,
    title: 'Water pipe leaking outside Sector 14 market gate',
    description: 'Continuous drinking water leakage on the street pavement.',
    location_text: 'Sector 14 Market Gate',
    priority: 'high'
  });

  let createdSuggestionId = '';

  t.after(() => {
    server.close();
  });

  await t.test('POST /api/webhooks/n8n/suggestions receives Workflow A AI suggestion and logs as pending', async () => {
    const res = await fetch(`${baseUrl}/webhooks/n8n/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaint_id: testComplaint.id,
        workflow_name: 'Workflow_A_Classification',
        suggestion_type: 'department_suggestion',
        suggestion_data: {
          department_id: 'd-jal-board',
          department_name: 'Delhi Jal Board',
          reasoning: 'Complaint involves clean drinking water main pipeline leak.'
        },
        confidence_score: 0.94
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.ok(data.data.id);
    assert.strictEqual(data.data.decision, 'pending');
    assert.strictEqual(data.data.confidence_score, 0.94);

    createdSuggestionId = data.data.id;
  });

  await t.test('POST /api/webhooks/n8n/suggestions validates required fields', async () => {
    const res = await fetch(`${baseUrl}/webhooks/n8n/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow_name: 'Workflow_A' })
    });
    assert.strictEqual(res.status, 400);
  });

  await t.test('POST /api/webhooks/n8n/sla-alert processes incoming SLA breach warning from Workflow C', async () => {
    const res = await fetch(`${baseUrl}/webhooks/n8n/sla-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaint_id: testComplaint.id,
        alert_type: 'deadline_approaching',
        breach_hours: 2
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
  });

  await t.test('GET /api/admin/ai/pending returns suggestions awaiting review in AI Operations Centre', async () => {
    // 1. Citizen blocked with 403
    const citizenRes = await fetch(`${baseUrl}/admin/ai/pending`, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    assert.strictEqual(citizenRes.status, 403);

    // 2. Admin retrieves pending list
    const adminRes = await fetch(`${baseUrl}/admin/ai/pending`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminData = await adminRes.json();
    assert.strictEqual(adminRes.status, 200);
    assert.strictEqual(adminData.success, true);
    assert.ok(Array.isArray(adminData.data));
    assert.ok(adminData.data.some(s => s.id === createdSuggestionId));
  });

  await t.test('POST /api/admin/ai/review/:id accepts suggestion and executes human-in-the-loop action', async () => {
    const res = await fetch(`${baseUrl}/admin/ai/review/${createdSuggestionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        decision: 'accepted',
        feedback_notes: 'Confirmed by junior engineer. Correctly identified as Jal Board.'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.suggestion.decision, 'accepted');
    assert.strictEqual(data.data.suggestion.reviewer_user_id, adminUser.id);
  });

  await t.test('POST /api/ai/chat provides grounded responses for citizen', async () => {
    // 1. Unauthenticated request rejected
    const noAuthRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is my complaint status?' })
    });
    assert.strictEqual(noAuthRes.status, 401);

    // 2. Citizen asking about their complaint status
    const statusRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`
      },
      body: JSON.stringify({ question: 'Can you tell me the status of my complaint?' })
    });
    const statusData = await statusRes.json();
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusData.success, true);
    assert.ok(statusData.data.reply.includes(testComplaint.public_number), 'Must cite citizen complaint number');

    // 3. Citizen asking how to reopen
    const reopenRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`
      },
      body: JSON.stringify({ question: 'How do I reopen an issue if it was not fixed?' })
    });
    const reopenData = await reopenRes.json();
    assert.strictEqual(reopenRes.status, 200);
    assert.ok(reopenData.data.reply.includes('reopen') || reopenData.data.reply.includes('Verification Queue'));

    // 4. Citizen asking about SLA deadlines
    const slaRes = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`
      },
      body: JSON.stringify({ question: 'What are your SLA deadlines for urgent issues?' })
    });
    const slaData = await slaRes.json();
    assert.strictEqual(slaRes.status, 200);
    assert.ok(slaData.data.reply.includes('12 Hours'));
  });

  await t.test('GET /api/admin/complaints/stagnant retrieves stagnant complaints exceeding threshold', async () => {
    const res = await fetch(`${baseUrl}/admin/complaints/stagnant?days=5`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
  });

  await t.test('POST /api/webhooks/n8n/escalate-unresponded triggers 5-day SLA escalation and email alert', async () => {
    const res = await fetch(`${baseUrl}/webhooks/n8n/escalate-unresponded`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaint_id: testComplaint.id,
        days_unresponded: 5.5,
        reason: 'Issue passed 5 days without response from assigned department. Escalated to Higher Authorities.'
      })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.emailSent, true);
    assert.strictEqual(data.data.daysUnresponded, 5.5);
  });
});

