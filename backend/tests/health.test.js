import test from 'node:test';
import assert from 'node:assert';
import app from '../src/app.js';

test('App module initializes and provides endpoints', async (t) => {
  await t.test('Root endpoint / returns online status', async () => {
    // We can start a lightweight server on port 0 to test HTTP response
    const server = app.listen(0);
    const port = server.address().port;
    
    try {
      const response = await fetch(`http://localhost:${port}/`);
      const data = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.status, 'online');
    } finally {
      server.close();
    }
  });

  await t.test('Health check /api/health returns healthy', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    
    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      const data = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.status, 'healthy');
      assert.strictEqual(data.service, 'nagar-drishti-backend');
      assert.ok(data.uptimeSeconds >= 0);
    } finally {
      server.close();
    }
  });

  await t.test('Non-existent route returns 404 with structured JSON', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    
    try {
      const response = await fetch(`http://localhost:${port}/non-existent-endpoint`);
      const data = await response.json();
      
      assert.strictEqual(response.status, 404);
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.error.statusCode, 404);
    } finally {
      server.close();
    }
  });
});
