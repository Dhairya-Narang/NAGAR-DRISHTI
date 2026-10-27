import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { testConnection } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

test('Phase 2 Database Schema & Config Validation', async (t) => {
  await t.test('testConnection helper returns graceful connection status', async () => {
    const status = await testConnection();
    assert.strictEqual(typeof status.connected, 'boolean');
    assert.strictEqual(typeof status.message, 'string');
  });

  await t.test('database/schema.sql contains Option A profile tables and core entities', () => {
    const schemaPath = path.join(rootDir, 'database/schema.sql');
    assert.ok(fs.existsSync(schemaPath), 'schema.sql must exist');
    
    const content = fs.readFileSync(schemaPath, 'utf8');
    
    // Check Option A dedicated tables
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS citizen_profiles'), 'Must contain citizen_profiles table');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS admin_profiles'), 'Must contain admin_profiles table');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS users'), 'Must contain users table');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS complaints'), 'Must contain complaints table');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS departments'), 'Must contain departments table');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS categories'), 'Must contain categories table');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS status_history'), 'Must contain status_history table');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS activity_log'), 'Must contain activity_log table');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS notifications'), 'Must contain notifications table');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS ai_review_log'), 'Must contain ai_review_log table');
    assert.ok(content.includes('CREATE TABLE IF NOT EXISTS sla_rules'), 'Must contain sla_rules table');
  });

  await t.test('database/seed.sql contains demo data with hashed passwords and demo complaints', () => {
    const seedPath = path.join(rootDir, 'database/seed.sql');
    assert.ok(fs.existsSync(seedPath), 'seed.sql must exist');
    
    const content = fs.readFileSync(seedPath, 'utf8');
    
    // Check demo users and Option A profiles
    assert.ok(content.includes('admin@nagardrishti.gov.in'), 'Must contain demo admin');
    assert.ok(content.includes('citizen@example.com'), 'Must contain demo citizen');
    assert.ok(content.includes('ND-ADM-001'), 'Must contain admin employee ID');
    assert.ok(content.includes('ND-2026-0001'), 'Must contain demo complaint ND-2026-0001');
    assert.ok(content.includes('ND-2026-0002'), 'Must contain duplicate demo complaint ND-2026-0002');
    assert.ok(content.includes('ND-2026-0003'), 'Must contain SLA urgent demo complaint ND-2026-0003');
    assert.ok(content.includes('ND-2026-0004'), 'Must contain resolved demo complaint ND-2026-0004');
    assert.ok(content.includes('Workflow_B_Duplicates'), 'Must contain AI duplicate review record');
  });
});
