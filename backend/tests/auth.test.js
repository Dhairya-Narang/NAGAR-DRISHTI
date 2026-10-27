import test from 'node:test';
import assert from 'node:assert';
import app from '../src/app.js';
import { authorizeRoles, authenticateToken } from '../src/middleware/auth.js';

test('Phase 3: Authentication & Role-Based Authorization', async (t) => {
  // Create test server
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/auth`;

  let citizenToken = '';
  let adminToken = '';

  t.after(() => {
    server.close();
  });

  await t.test('POST /api/auth/register registers citizen with Option A citizen_profile', async () => {
    const res = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Rohan Gupta',
        email: 'rohan.gupta@example.com',
        password: 'Password@123',
        phone: '+91-9876543210',
        address: 'B-404, Sunshine Heights',
        ward: 'Ward 12',
        pincode: '110025'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.user.role, 'citizen');
    assert.strictEqual(data.data.profile.ward, 'Ward 12');
    assert.strictEqual(data.data.profile.pincode, '110025');
    assert.ok(data.data.token, 'Must return JWT token');
    assert.strictEqual(typeof data.data.token, 'string');

    citizenToken = data.data.token;
  });

  await t.test('POST /api/auth/register prevents duplicate email registration', async () => {
    const res = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate Rohan',
        email: 'rohan.gupta@example.com',
        password: 'Password@123'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 409);
    assert.strictEqual(data.success, false);
  });

  await t.test('POST /api/auth/register validates required input fields', async () => {
    // Missing password
    const res1 = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Short Pass', email: 'short@example.com', password: '123' })
    });
    assert.strictEqual(res1.status, 400);

    // Invalid email
    const res2 = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bad Email', email: 'not-an-email', password: 'Password@123' })
    });
    assert.strictEqual(res2.status, 400);
  });

  await t.test('POST /api/auth/register registers admin with Option A admin_profile', async () => {
    const res = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Inspector Sandeep',
        email: 'sandeep.admin@nagardrishti.gov.in',
        password: 'AdminPassword@123',
        role: 'admin',
        designation: 'Senior Sanitation Inspector',
        employee_id: 'ND-SAN-042'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.user.role, 'admin');
    assert.strictEqual(data.data.profile.designation, 'Senior Sanitation Inspector');
    assert.strictEqual(data.data.profile.employee_id, 'ND-SAN-042');
    assert.ok(data.data.token);

    adminToken = data.data.token;
  });

  await t.test('POST /api/auth/login authenticates citizen with valid credentials', async () => {
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'rohan.gupta@example.com',
        password: 'Password@123'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.user.email, 'rohan.gupta@example.com');
    assert.strictEqual(data.data.user.role, 'citizen');
    assert.strictEqual(data.data.profile.ward, 'Ward 12');
  });

  await t.test('POST /api/auth/login rejects wrong password with 401', async () => {
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'rohan.gupta@example.com',
        password: 'WrongPassword'
      })
    });

    const data = await res.json();
    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
  });

  await t.test('GET /api/auth/me rejects unauthenticated request with 401', async () => {
    const res = await fetch(`${baseUrl}/me`);
    const data = await res.json();
    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
  });

  await t.test('GET /api/auth/me returns current user profile when authenticated', async () => {
    const res = await fetch(`${baseUrl}/me`, {
      headers: { Authorization: `Bearer ${citizenToken}` }
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.user.email, 'rohan.gupta@example.com');
    assert.strictEqual(data.data.profile.ward, 'Ward 12');
  });

  await t.test('Role guard blocks citizen from admin endpoints with 403 Forbidden', async () => {
    const adminGuard = authorizeRoles('admin');

    // 1. Citizen attempt should receive 403 Forbidden
    let citizenStatus = 0;
    let citizenPayload = null;
    let citizenNextCalled = false;

    const mockCitizenReq = { user: { id: '1', role: 'citizen', name: 'Citizen' } };
    const mockCitizenRes = {
      status(code) {
        citizenStatus = code;
        return {
          json(payload) {
            citizenPayload = payload;
          }
        };
      }
    };

    adminGuard(mockCitizenReq, mockCitizenRes, () => {
      citizenNextCalled = true;
    });

    assert.strictEqual(citizenStatus, 403);
    assert.strictEqual(citizenPayload.success, false);
    assert.ok(citizenPayload.error.message.includes('Forbidden'));
    assert.strictEqual(citizenNextCalled, false);

    // 2. Admin attempt should successfully call next()
    let adminNextCalled = false;
    const mockAdminReq = { user: { id: '2', role: 'admin', name: 'Admin' } };
    const mockAdminRes = {};

    adminGuard(mockAdminReq, mockAdminRes, () => {
      adminNextCalled = true;
    });

    assert.strictEqual(adminNextCalled, true);
  });

  await t.test('POST /api/auth/logout returns success confirmation', async () => {
    const res = await fetch(`${baseUrl}/logout`, { method: 'POST' });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
  });
});
