import pkg from 'pg';
const { Pool } = pkg;
import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

let pool = null;
let supabase = null;

// Initialize Supabase client if URL and Key are provided
if (env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY)) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  supabase = createClient(env.SUPABASE_URL, key, {
    auth: {
      persistSession: false
    }
  });
}

// Helper to normalize and resolve connection string (handles bracketed passwords and IPv4 pooler)
function resolveDatabaseUrl(rawUrl) {
  if (!rawUrl) return null;
  let url = rawUrl.trim();

  // Strip accidental brackets from password: postgres:[pass]@host -> postgres:pass@host
  url = url.replace(/:\s*\[([^\]]+)\]@/, (m, p) => `:${p}@`);

  // Detect un-replaced placeholders
  if (url.includes('your-project.supabase.co') || url.includes('[YOUR-PASSWORD]')) {
    return null;
  }

  // Auto-route known Supabase project to IPv4 pooler if direct IPv6 host is used
  if (url.includes('db.gulglhwjkjoyfnjzzmpb.supabase.co')) {
    url = url.replace('db.gulglhwjkjoyfnjzzmpb.supabase.co', 'aws-0-eu-west-1.pooler.supabase.com');
    if (!url.includes('postgres.gulglhwjkjoyfnjzzmpb')) {
      url = url.replace('postgres:', 'postgres.gulglhwjkjoyfnjzzmpb:');
    }
  }

  return url;
}

const resolvedDbUrl = resolveDatabaseUrl(env.DATABASE_URL);

if (resolvedDbUrl && env.NODE_ENV !== 'test') {
  const isSupabase = resolvedDbUrl.includes('supabase.co') || resolvedDbUrl.includes('supabase.com') || resolvedDbUrl.includes('pooler');
  pool = new Pool({
    connectionString: resolvedDbUrl,
    ssl: env.isProduction || isSupabase
      ? { rejectUnauthorized: false }
      : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err);
  });
}

/**
 * Executes a SQL query using the connection pool
 * @param {string} text - SQL query string
 * @param {Array} [params] - Query parameters
 * @returns {Promise<any>}
 */
export const query = async (text, params) => {
  if (!pool) {
    throw new Error(
      'Database is not connected. Please set a valid DATABASE_URL in your .env file or Supabase project.'
    );
  }
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (env.NODE_ENV === 'development') {
      console.log('Executed query', { text: text.slice(0, 100), duration: `${duration}ms`, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Database query error:', { query: text.slice(0, 100), message: error.message });
    throw error;
  }
};

/**
 * Verifies database connectivity
 * @returns {Promise<{ connected: boolean, message: string }>}
 */
export const testConnection = async () => {
  if (!pool) {
    return {
      connected: false,
      message: 'DATABASE_URL is not configured or uses placeholder values.'
    };
  }
  try {
    const res = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    return {
      connected: true,
      message: 'Successfully connected to PostgreSQL database.',
      serverTime: res.rows[0].current_time,
      version: res.rows[0].pg_version
    };
  } catch (error) {
    return {
      connected: false,
      message: error.message
    };
  }
};

export { pool, supabase };
