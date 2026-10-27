import test from 'node:test';
import assert from 'node:assert';
import app from '../src/app.js';
import { generateToken } from '../src/services/authService.js';

test('End-to-End Hackathon Demo Lifecycle (12-Step Scenario)', async (t) => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  // Citizen 1
  const citizen1User = {
    id: 'e3333333-3333-3333-3333-333333333333',
    name: 'Vikram Malhotra',
    email: 'citizen1.demo@example.com',
    role: 'citizen'
  };
  const citizen1Token = generateToken(citizen1User);

  // Citizen 2
  const citizen2User = {
    id: 'e4444444-4444-4444-4444-444444444444',
    name: 'Priya Sharma',
    email: 'citizen2.demo@example.com',
    role: 'citizen'
  };
  const citizen2Token = generateToken(citizen2User);

  // Superadmin
  const adminUser = {
    id: 'e1111111-1111-1111-1111-111111111111',
    name: 'Rajesh Sharma',
    email: 'admin.demo@nagardrishti.gov.in',
    role: 'admin'
  };
  const adminToken = generateToken(adminUser);

  let complaint1 = null;
  let complaint2 = null;
  let suggestion1Id = null;
  let duplicateSuggestionId = null;

  try {
    // ----------------------------------------------------
    // Step 1: Citizen 1 submits road-damage complaint
    // ----------------------------------------------------
    await t.test('Step 1: Citizen 1 submits initial road-damage complaint', async () => {
      const res = await fetch(`${baseUrl}/api/complaints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${citizen1Token}`
        },
        body: JSON.stringify({
          title: 'Deep Hazardous Pothole on Sector 14 Main Road',
          description: 'A 2-foot pothole has opened up after torrential rains right in the driving lane.',
          category_id: 'c1111111-1111-1111-1111-111111111111',
          location_text: 'Sector 14 Main Avenue, opposite Mother Dairy booth #4',
          landmark: 'Mother Dairy booth #4',
          ward: 'Ward 12',
          latitude: 28.535516,
          longitude: 77.251012,
          priority: 'medium'
        })
      });

      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.ok(body.data.id);
      assert.ok(body.data.public_number);
      assert.strictEqual(body.data.status, 'Pending');
      complaint1 = body.data;
    });

    // ----------------------------------------------------
    // Step 2: AI workflow suggests category, department (PWD), and priority
    // ----------------------------------------------------
    await t.test('Step 2: n8n AI webhook logs classification suggestion', async () => {
      const res = await fetch(`${baseUrl}/api/webhooks/n8n/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaint_id: complaint1.id,
          workflow_name: 'Workflow_A_Classification',
          suggestion_type: 'department_suggestion',
          confidence_score: 0.95,
          suggestion_data: {
            suggested_department: 'PWD',
            suggested_department_id: 'd1111111-1111-1111-1111-111111111111',
            suggested_priority: 'high',
            reasoning: 'Road crater located on arterial transit avenue with high hazard probability'
          }
        })
      });

      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.decision, 'pending');
      suggestion1Id = body.data.id;
    });

    // ----------------------------------------------------
    // Step 3: Admin reviews and accepts AI suggestion in AI Operations Centre
    // ----------------------------------------------------
    await t.test('Step 3: Admin accepts AI suggestion via AI Operations Centre', async () => {
      const res = await fetch(`${baseUrl}/api/admin/ai/review/${suggestion1Id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          decision: 'accepted',
          feedback_notes: 'Confirmed hazard. Upgraded priority to high and mapped to PWD.'
        })
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.data.suggestion.decision, 'accepted');
    });

    // ----------------------------------------------------
    // Step 4: Second citizen submits related report in same area
    // ----------------------------------------------------
    await t.test('Step 4: Citizen 2 submits nearby complaint', async () => {
      const res = await fetch(`${baseUrl}/api/complaints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${citizen2Token}`
        },
        body: JSON.stringify({
          title: 'Massive crater near Sector 14 Mother Dairy',
          description: 'Road collapsed near the dairy booth causing vehicle damage.',
          category_id: 'c1111111-1111-1111-1111-111111111111',
          location_text: 'Sector 14 Road near Mother Dairy',
          landmark: 'Mother Dairy booth #4',
          ward: 'Ward 12',
          latitude: 28.535600,
          longitude: 77.251100,
          priority: 'medium'
        })
      });

      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      complaint2 = body.data;
    });

    // ----------------------------------------------------
    // Step 5: AI Duplicate Detection flags potential duplicate
    // ----------------------------------------------------
    await t.test('Step 5: n8n AI webhook flags potential duplicate complaint', async () => {
      const res = await fetch(`${baseUrl}/api/webhooks/n8n/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaint_id: complaint2.id,
          workflow_name: 'Workflow_B_Duplicates',
          suggestion_type: 'duplicate_flag',
          confidence_score: 0.91,
          suggestion_data: {
            potential_duplicate_of: complaint1.public_number,
            parent_id: complaint1.id,
            distance_meters: 18,
            matching_keywords: ['crater', 'Sector 14', 'Mother Dairy']
          }
        })
      });

      assert.strictEqual(res.status, 201);
      const body = await res.json();
      duplicateSuggestionId = body.data.id;
    });

    // ----------------------------------------------------
    // Step 6: Admin links duplicate report to primary incident
    // ----------------------------------------------------
    await t.test('Step 6: Admin accepts duplicate recommendation and links complaint', async () => {
      const res = await fetch(`${baseUrl}/api/admin/ai/review/${duplicateSuggestionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          decision: 'accepted',
          feedback_notes: 'Linked as clustered duplicate incident.'
        })
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.data.suggestion.decision, 'accepted');
    });

    // ----------------------------------------------------
    // Step 7: Department marks complaint In Progress
    // ----------------------------------------------------
    await t.test('Step 7: Admin assigns PWD and moves status to In Progress', async () => {
      const res = await fetch(`${baseUrl}/api/admin/complaints/${complaint1.id}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          department_id: 'd1111111-1111-1111-1111-111111111111',
          assigned_to_admin_id: 'e2222222-2222-2222-2222-222222222222',
          note: 'Assigned to PWD Roads Division Executive Engineer.'
        })
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.data.status, 'In Progress');
      assert.strictEqual(body.data.department_id, 'd1111111-1111-1111-1111-111111111111');
    });

    // ----------------------------------------------------
    // Step 8: Simulated SLA warning alerts department
    // ----------------------------------------------------
    await t.test('Step 8: n8n SLA Alert webhook notifies breach warning', async () => {
      const res = await fetch(`${baseUrl}/api/webhooks/n8n/sla-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaint_id: complaint1.id,
          priority: 'high',
          hours_remaining: 2,
          alert_level: 'warning',
          message: 'SLA deadline approaching in 2 hours for Sector 14 Pothole.'
        })
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
    });

    // ----------------------------------------------------
    // Step 9: Department marks Resolved with resolution notes
    // ----------------------------------------------------
    await t.test('Step 9: Admin resolves complaint with evidence notes', async () => {
      const res = await fetch(`${baseUrl}/api/admin/complaints/${complaint1.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          resolution_notes: 'Hot mix asphalt patching completed. Surface leveled and compacted.',
          verification_required: true
        })
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.data.status, 'Resolved');
      assert.strictEqual(body.data.verification_status, 'pending_verification');
    });

    // ----------------------------------------------------
    // Step 10: Citizen disputes resolution and reopens complaint
    // ----------------------------------------------------
    await t.test('Step 10: Citizen inspects resolution and reopens complaint with reason', async () => {
      const res = await fetch(`${baseUrl}/api/complaints/${complaint1.id}/reopen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${citizen1Token}`
        },
        body: JSON.stringify({
          reason: 'Only loose gravel was dumped. Pothole opened back up within 12 hours.'
        })
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.data.status, 'Reopened');
      assert.strictEqual(body.data.verification_status, 'pending_verification');
    });

    // ----------------------------------------------------
    // Step 11: Admin verifies complaint reopening in Verification Queue
    // ----------------------------------------------------
    await t.test('Step 11: Admin verifies complaint reopening in Verification Queue', async () => {
      const res = await fetch(`${baseUrl}/api/admin/complaints/${complaint1.id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          decision: 'rejected', // Reject previous resolution -> confirms reopened for rework
          notes: 'Citizen photos show loose gravel erosion. Reopening confirmed for PWD site re-work.'
        })
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.data.status, 'Reopened');
      assert.strictEqual(body.data.verification_status, 'rejected');
    });

    // ----------------------------------------------------
    // Step 12: Citizen and Admin Dashboards reflect complete transparent lifecycle
    // ----------------------------------------------------
    await t.test('Step 12: Full audit trail, notifications, and dashboard stats verified', async () => {
      // Citizen dashboard
      const citRes = await fetch(`${baseUrl}/api/dashboard/citizen-summary`, {
        headers: { 'Authorization': `Bearer ${citizen1Token}` }
      });
      assert.strictEqual(citRes.status, 200);
      const citData = await citRes.json();
      assert.ok(citData.data.stats.total >= 1);

      // Admin activities feed
      const actRes = await fetch(`${baseUrl}/api/admin/activities`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(actRes.status, 200);
      const actData = await actRes.json();
      assert.ok(Array.isArray(actData.data.activities));

      // Complaint timeline
      const detailRes = await fetch(`${baseUrl}/api/complaints/${complaint1.id}`, {
        headers: { 'Authorization': `Bearer ${citizen1Token}` }
      });
      assert.strictEqual(detailRes.status, 200);
      const detailData = await detailRes.json();
      assert.ok(detailData.data.timeline.length >= 3);
      assert.strictEqual(detailData.data.complaint.status, 'Reopened');
    });

  } finally {
    server.close();
  }
});
