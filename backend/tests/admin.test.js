import test from 'node:test';
import assert from 'node:assert';
import app from '../src/app.js';
import { generateToken } from '../src/services/authService.js';
import { createComplaint } from '../src/services/complaintService.js';

test('Phase 5: Admin Operations & Complaint Lifecycle Management', async (t) => {
  const server = app.listen(0);
  const port = server.address().port;
  const adminBaseUrl = `http://localhost:${port}/api/admin`;

  const citizenUser = { id: 'u-cit-admin-test', name: 'Citizen Test', email: 'cit.test@example.com', role: 'citizen' };
  const adminUser = { id: 'u-adm-chief', name: 'Chief Officer', email: 'chief@nagardrishti.gov.in', role: 'admin' };

  const citizenToken = generateToken(citizenUser);
  const adminToken = generateToken(adminUser);

  // Create test complaint to operate on
  const testComplaint = await createComplaint({
    userId: citizenUser.id,
    userName: citizenUser.name,
    title: 'Major sewer line backup flooding street',
    description: 'Black water overflowing onto main street near school gate.',
    location_text: 'School Road, Ward 12',
    ward: 'Ward 12',
    priority: 'high'
  });

  t.after(() => {
    server.close();
  });

  await t.test('GET /api/admin/complaints enforces role barrier (blocks citizens with 403)', async () => {
    // 1. Unauthenticated request
    const noAuthRes = await fetch(`${adminBaseUrl}/complaints`);
    assert.strictEqual(noAuthRes.status, 401);

    // 2. Citizen request
    const citizenRes = await fetch(`${adminBaseUrl}/complaints`, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    const citizenData = await citizenRes.json();
    assert.strictEqual(citizenRes.status, 403);
    assert.strictEqual(citizenData.success, false);
    assert.ok(citizenData.error.message.includes('Forbidden'));
  });

  await t.test('GET /api/admin/complaints lists complaints with administrative filtering for admin', async () => {
    const res = await fetch(`${adminBaseUrl}/complaints?status=Pending`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.data.complaints);
    assert.ok(data.data.pagination);
  });

  await t.test('POST /api/admin/complaints/:id/assign assigns department and advances Pending -> In Progress', async () => {
    const deptId = 'd-sewerage-board';
    const res = await fetch(`${adminBaseUrl}/complaints/${testComplaint.id}/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        department_id: deptId,
        notes: 'Assigned to Delhi Jal Board emergency sewage unit'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.department_id, deptId);
    assert.strictEqual(data.data.status, 'In Progress');
  });

  await t.test('POST /api/admin/complaints/:id/resolve resolves complaint with closure notes and sets verification queue', async () => {
    // Rejects if resolution notes are missing
    const badRes = await fetch(`${adminBaseUrl}/complaints/${testComplaint.id}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({})
    });
    assert.strictEqual(badRes.status, 400);

    // Valid resolution
    const resolveRes = await fetch(`${adminBaseUrl}/complaints/${testComplaint.id}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        resolution_notes: 'Jetting machine deployed. Sewer blockage cleared and manhole covered.',
        resolution_proof_url: 'https://storage.nagardrishti.gov.in/evidence/clean-sewer.jpg'
      })
    });

    const data = await resolveRes.json();
    assert.strictEqual(resolveRes.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, 'Resolved');
    assert.strictEqual(data.data.verification_status, 'pending_verification');
    assert.ok(data.data.resolved_at);
  });

  await t.test('POST /api/admin/complaints/:id/verify verifies resolution in Verification Queue', async () => {
    const verifyRes = await fetch(`${adminBaseUrl}/complaints/${testComplaint.id}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        decision: 'verified',
        notes: 'Site inspection confirmed clear road and operating drain.'
      })
    });

    const data = await verifyRes.json();
    assert.strictEqual(verifyRes.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, 'Resolved');
    assert.strictEqual(data.data.verification_status, 'verified');
  });

  await t.test('POST /api/admin/complaints/:id/verify rejecting resolution reopens complaint', async () => {
    // Create another complaint and resolve it
    const comp2 = await createComplaint({
      userId: citizenUser.id,
      userName: citizenUser.name,
      title: 'Broken handrail on pedestrian overbridge',
      description: 'Dangerous loose railing risking pedestrian fall.',
      location_text: 'Sector 15 Flyover'
    });

    // Mark it resolved
    await fetch(`${adminBaseUrl}/complaints/${comp2.id}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ resolution_notes: 'Welded handrail.' })
    });

    // Supervisor rejects verification
    const rejectRes = await fetch(`${adminBaseUrl}/complaints/${comp2.id}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        decision: 'rejected',
        notes: 'Citizen photos show welding is still unstable. Rework required.'
      })
    });

    const data = await rejectRes.json();
    assert.strictEqual(rejectRes.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.status, 'Reopened');
    assert.strictEqual(data.data.verification_status, 'rejected');
  });

  await t.test('POST /api/admin/complaints/:id/escalate escalates complaint to urgent priority', async () => {
    const res = await fetch(`${adminBaseUrl}/complaints/${testComplaint.id}/escalate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        reason: 'SLA overdue and hazardous public health risk reported by ward councillor.'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.is_escalated, true);
    assert.strictEqual(data.data.priority, 'urgent');
    assert.ok(data.data.escalation_reason.includes('councillor'));
  });
});
