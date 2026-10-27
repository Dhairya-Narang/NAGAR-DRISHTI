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

// Initialize PostgreSQL connection pool only if a non-placeholder DATABASE_URL is configured
const isPlaceholderDbUrl =
  !env.DATABASE_URL ||
  env.DATABASE_URL.includes('[YOUR-PASSWORD]') ||
  env.DATABASE_URL.includes('[YOUR-DB-PASSWORD]') ||
  env.DATABASE_URL.includes('your-project.supabase.co');

if (!isPlaceholderDbUrl) {
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.isProduction || env.DATABASE_URL.includes('supabase.co')
      ? { rejectUnauthorized: false }
      : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
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
