import test from 'node:test';
import assert from 'node:assert';
import app from '../src/app.js';
import { generateToken } from '../src/services/authService.js';
import { createNotification } from '../src/services/notificationService.js';
import { createComplaint } from '../src/services/complaintService.js';

test('Phase 6: Dashboards, Analytics & Notifications API', async (t) => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  const citizenUser = { id: 'u-cit-dash', name: 'Aarav Patel', email: 'aarav@example.com', role: 'citizen' };
  const adminUser = { id: 'u-adm-dash', name: 'Chief Analytics Officer', email: 'analytics@nagardrishti.gov.in', role: 'admin' };

  const citizenToken = generateToken(citizenUser);
  const adminToken = generateToken(adminUser);

  // Seed a sample complaint for the citizen
  await createComplaint({
    userId: citizenUser.id,
    userName: citizenUser.name,
    title: 'Streetlight pole tilted precariously over footpath',
    description: 'Electric pole leaning after truck impact, live wires exposed.',
    location_text: 'Footpath near Metro Pillar 142',
    priority: 'urgent'
  });

  // Seed a sample notification for the citizen
  const seedNotif = await createNotification({
    recipientUserId: citizenUser.id,
    title: 'Complaint Registered',
    message: 'Your complaint regarding tilted pole has been logged.',
    type: 'status_update'
  });

  t.after(() => {
    server.close();
  });

  await t.test('GET /api/dashboard/citizen-summary returns citizen metrics and recent complaints', async () => {
    const res = await fetch(`${baseUrl}/dashboard/citizen-summary`, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.data.stats, 'Must contain stats');
    assert.ok(data.data.stats.total >= 1);
    assert.ok(typeof data.data.unreadNotificationsCount === 'number');
    assert.ok(Array.isArray(data.data.recentComplaints));
  });

  await t.test('GET /api/admin/dashboard-summary enforces role barrier and returns municipal metrics', async () => {
    // 1. Citizen blocked with 403 Forbidden
    const citizenRes = await fetch(`${baseUrl}/admin/dashboard-summary`, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    assert.strictEqual(citizenRes.status, 403);

    // 2. Admin allowed with 200 OK
    const adminRes = await fetch(`${baseUrl}/admin/dashboard-summary`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminData = await adminRes.json();
    assert.strictEqual(adminRes.status, 200);
    assert.strictEqual(adminData.success, true);
    assert.ok(adminData.data.metrics);
    assert.ok(typeof adminData.data.metrics.total === 'number');
    assert.ok(typeof adminData.data.metrics.pending === 'number');
    assert.ok(typeof adminData.data.metrics.overdue === 'number');
    assert.ok(adminData.data.priorityBreakdown);
    assert.ok(Array.isArray(adminData.data.departmentSummary));
  });

  await t.test('GET /api/admin/activities returns audit activity feed', async () => {
    const res = await fetch(`${baseUrl}/admin/activities`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.activities));
  });

  await t.test('GET /api/admin/departments returns municipal departments directory', async () => {
    const res = await fetch(`${baseUrl}/admin/departments`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.length >= 2);
  });

  await t.test('GET /api/notifications returns user notifications list and unread count', async () => {
    const res = await fetch(`${baseUrl}/notifications`, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.notifications));
    assert.ok(data.data.unreadCount >= 1);
  });

  await t.test('PATCH /api/notifications/:id/read marks single notification as read', async () => {
    const res = await fetch(`${baseUrl}/notifications/${seedNotif.id}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${citizenToken}` }
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.data.read_at, 'read_at must be populated');
  });

  await t.test('PATCH /api/notifications/read-all marks all notifications as read', async () => {
    // Add another notification to mark
    await createNotification({
      recipientUserId: citizenUser.id,
      title: 'Action Update',
      message: 'Staff dispatched.'
    });

    const res = await fetch(`${baseUrl}/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${citizenToken}` }
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);

    // Verify unread count is now 0
    const listRes = await fetch(`${baseUrl}/notifications`, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });
    const listData = await listRes.json();
    assert.strictEqual(listData.data.unreadCount, 0);
  });
});
