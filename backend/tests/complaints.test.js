import test from 'node:test';
import assert from 'node:assert';
import app from '../src/app.js';
import { generateToken } from '../src/services/authService.js';

test('Phase 4: Citizen Complaint Engine & Attachments', async (t) => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/complaints`;

  // Generate tokens for test users
  const citizen1 = { id: 'u-cit-1', name: 'Citizen One', email: 'cit1@example.com', role: 'citizen' };
  const citizen2 = { id: 'u-cit-2', name: 'Citizen Two', email: 'cit2@example.com', role: 'citizen' };
  const adminUser = { id: 'u-adm-1', name: 'Admin Officer', email: 'adm1@example.com', role: 'admin' };

  const token1 = generateToken(citizen1);
  const token2 = generateToken(citizen2);
  const adminToken = generateToken(adminUser);

  let createdComplaintId = '';
  let createdPublicNumber = '';

  t.after(() => {
    server.close();
  });

  await t.test('POST /api/complaints rejects unauthenticated requests with 401', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Broken road surface',
        description: 'Large potholes forming on main road',
        location_text: 'Sector 15 Market'
      })
    });
    assert.strictEqual(res.status, 401);
  });

  await t.test('POST /api/complaints validates input fields', async () => {
    // Title too short
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`
      },
      body: JSON.stringify({
        title: 'Hi',
        description: 'Large potholes forming on main road',
        location_text: 'Sector 15 Market'
      })
    });
    assert.strictEqual(res.status, 400);
  });

  await t.test('POST /api/complaints successfully submits complaint and generates public tracking number', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`
      },
      body: JSON.stringify({
        title: 'Dangerous water pipeline leakage on street',
        description: 'Potable drinking water leaking continuously for 12 hours from main pipe.',
        location_text: 'Near Mother Dairy, Block B, Sector 12',
        landmark: 'Opposite Community Hall',
        ward: 'Ward 12',
        priority: 'high'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.ok(data.data.id);
    assert.strictEqual(data.data.status, 'Pending');
    assert.strictEqual(data.data.priority, 'high');
    assert.ok(data.data.due_at);
    assert.ok(data.data.public_number.startsWith('ND-'), 'Must start with ND- prefix');

    createdComplaintId = data.data.id;
    createdPublicNumber = data.data.public_number;
  });

  await t.test('GET /api/complaints/mine returns complaints for logged-in citizen', async () => {
    const res = await fetch(`${baseUrl}/mine`, {
      headers: { Authorization: `Bearer ${token1}` }
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.complaints));
    assert.ok(data.data.complaints.length >= 1);
    assert.strictEqual(data.data.complaints[0].reporter_user_id, citizen1.id);
    assert.ok(data.data.pagination);
  });

  await t.test('GET /api/complaints/:id allows owner citizen to view complaint details and timeline', async () => {
    const res = await fetch(`${baseUrl}/${createdComplaintId}`, {
      headers: { Authorization: `Bearer ${token1}` }
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.complaint.id, createdComplaintId);
    assert.ok(Array.isArray(data.data.timeline), 'Must return timeline');
    assert.strictEqual(data.data.timeline[0].new_status, 'Pending');
  });

  await t.test('GET /api/complaints/:id blocks another citizen with 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/${createdComplaintId}`, {
      headers: { Authorization: `Bearer ${token2}` }
    });

    const data = await res.json();
    assert.strictEqual(res.status, 403);
    assert.strictEqual(data.success, false);
    assert.ok(data.error.message.includes('Access denied'));
  });

  await t.test('GET /api/complaints/:id allows admin to view any citizen complaint', async () => {
    const res = await fetch(`${baseUrl}/${createdComplaintId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.complaint.id, createdComplaintId);
  });

  await t.test('POST /api/complaints/:id/attachments uploads file evidence', async () => {
    const formData = new FormData();
    const fakeFileContent = new Blob(['sample-photo-bytes'], { type: 'image/png' });
    formData.append('file', fakeFileContent, 'pothole-photo.png');
    formData.append('attachmentKind', 'complaint_evidence');

    const res = await fetch(`${baseUrl}/${createdComplaintId}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: formData
    });

    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.file_name, 'pothole-photo.png');
    assert.strictEqual(data.data.attachment_kind, 'complaint_evidence');
  });

  await t.test('POST /api/complaints/:id/reopen rejects reopening pending complaint with 400', async () => {
    const res = await fetch(`${baseUrl}/${createdComplaintId}/reopen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`
      },
      body: JSON.stringify({ reason: 'Issue is not resolved' })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(data.success, false);
    assert.ok(data.error.message.includes("Only 'Resolved' complaints can be reopened"));
  });

  await t.test('POST /api/complaints/:id/reopen reopens resolved complaint and appends to timeline', async () => {
    // Submit a complaint, simulate resolving it, then test reopening
    const createRes = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`
      },
      body: JSON.stringify({
        title: 'Streetlight blinking at Sector 14 Gate 3',
        description: 'Light flickers non-stop causing visibility trouble at night.',
        location_text: 'Sector 14 Gate 3'
      })
    });
    const createData = await createRes.json();
    const resolvedComplaintId = createData.data.id;

    // Use updateComplaintStatus to resolve the complaint
    const { updateComplaintStatus } = await import('../src/services/complaintService.js');
    await updateComplaintStatus({
      complaintId: resolvedComplaintId,
      newStatus: 'Resolved',
      user: adminUser,
      notes: 'Streetlight LED bulb replaced by electrical operations'
    });

    // Now test reopening
    const reopenRes = await fetch(`${baseUrl}/${resolvedComplaintId}/reopen`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`
      },
      body: JSON.stringify({ reason: 'Streetlight worked for 1 day and failed again.' })
    });

    const reopenData = await reopenRes.json();
    assert.strictEqual(reopenRes.status, 200);
    assert.strictEqual(reopenData.success, true);
    assert.strictEqual(reopenData.data.status, 'Reopened');
    assert.strictEqual(reopenData.data.reopening_reason, 'Streetlight worked for 1 day and failed again.');

    // Verify timeline has Reopened event
    const detailRes = await fetch(`${baseUrl}/${resolvedComplaintId}`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const detailData = await detailRes.json();
    assert.strictEqual(detailData.data.timeline.at(-1).new_status, 'Reopened');
  });
});
