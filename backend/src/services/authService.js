import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, pool, supabase } from '../config/db.js';
import { env } from '../config/env.js';

// In-memory user store fallback for testing/dev environments without a live PostgreSQL database
const mockUsers = new Map();
const mockCitizenProfiles = new Map();
const mockAdminProfiles = new Map();

// Pre-seed demo users in memory fallback
const initDemoUsers = () => {
  const demoUsers = [
    {
      id: 'e1111111-1111-1111-1111-111111111111',
      name: 'Rajesh Sharma',
      email: 'admin@nagardrishti.gov.in',
      password_hash: '$2b$10$pX7QomZlaIPi9r4BLehb/uJS3pFn/7OSS41pSKPN76hgvUqRsN3P6',
      role: 'admin',
      phone: '+91-9811001122',
      is_active: true
    },
    {
      id: 'e2222222-2222-2222-2222-222222222222',
      name: 'Anita Verma',
      email: 'pwd.officer@nagardrishti.gov.in',
      password_hash: '$2b$10$pX7QomZlaIPi9r4BLehb/uJS3pFn/7OSS41pSKPN76hgvUqRsN3P6',
      role: 'admin',
      phone: '+91-9811002233',
      is_active: true
    },
    {
      id: 'e3333333-3333-3333-3333-333333333333',
      name: 'Vikram Malhotra',
      email: 'citizen@example.com',
      password_hash: '$2b$10$llNWhuvxXOh3zfner1WYre5U75ZEY.nh4rLo5I4DJ4o5fr1Yb/bNW',
      role: 'citizen',
      phone: '+91-9871234567',
      is_active: true
    },
    {
      id: 'e4444444-4444-4444-4444-444444444444',
      name: 'Priya Sharma',
      email: 'priya.sharma@example.com',
      password_hash: '$2b$10$llNWhuvxXOh3zfner1WYre5U75ZEY.nh4rLo5I4DJ4o5fr1Yb/bNW',
      role: 'citizen',
      phone: '+91-9871239999',
      is_active: true
    }
  ];

  for (const u of demoUsers) {
    mockUsers.set(u.email, u);
    mockUsers.set(u.id, u);
  }

  mockAdminProfiles.set('e1111111-1111-1111-1111-111111111111', {
    user_id: 'e1111111-1111-1111-1111-111111111111',
    employee_id: 'ND-ADM-001',
    designation: 'Chief Municipal Commissioner',
    is_superadmin: true
  });
  mockAdminProfiles.set('e2222222-2222-2222-2222-222222222222', {
    user_id: 'e2222222-2222-2222-2222-222222222222',
    employee_id: 'ND-PWD-102',
    designation: 'Executive Engineer (Roads)',
    department_name: 'Public Works Department (PWD)'
  });
  mockCitizenProfiles.set('e3333333-3333-3333-3333-333333333333', {
    user_id: 'e3333333-3333-3333-3333-333333333333',
    address: 'Flat 402, Green Glen Heights, Sector 14',
    ward: 'Ward 12',
    city: 'Delhi-NCR'
  });
  mockCitizenProfiles.set('e4444444-4444-4444-4444-444444444444', {
    user_id: 'e4444444-4444-4444-4444-444444444444',
    address: 'House 22, Lane 4, Sector 14 Market Area',
    ward: 'Ward 12',
    city: 'Delhi-NCR'
  });
};

initDemoUsers();

/**
 * Hash a plain text password
 */
export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

/**
 * Compare plain password with stored hash
 */
export const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

/**
 * Generate a signed JWT token
 */
export const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
};

/**
 * Verify a JWT token
 */
export const verifyToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};

/**
 * Register a citizen user with their specialized citizen_profile (Option A)
 */
export const registerCitizen = async ({
  name,
  email,
  password,
  phone = null,
  address = null,
  ward = null,
  city = 'Delhi-NCR',
  pincode = null,
  preferred_language = 'en'
}) => {
  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await hashPassword(password);

  if (pool) {
    // Check if user already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      const err = new Error('A user with this email address already exists');
      err.statusCode = 409;
      throw err;
    }

    // Insert user
    const userRes = await query(
      `INSERT INTO users (name, email, password_hash, role, phone)
       VALUES ($1, $2, $3, 'citizen', $4)
       RETURNING id, name, email, role, phone, is_active, created_at`,
      [name.trim(), normalizedEmail, passwordHash, phone]
    );
    const user = userRes.rows[0];

    // Sync to Supabase Auth (auth.users) so user appears in Supabase Authentication Dashboard
    if (supabase && env.NODE_ENV !== 'test') {
      try {
        await supabase.auth.admin.createUser({
          id: user.id,
          email: user.email,
          password: password,
          email_confirm: true,
          user_metadata: { name: user.name, role: user.role }
        });
      } catch (authErr) {
        // Non-blocking if already in Auth or network warning
        console.warn('Supabase Auth sync notice:', authErr.message);
      }
    }

    // Insert citizen profile (Option A)
    const profileRes = await query(
      `INSERT INTO citizen_profiles (user_id, address, ward, city, pincode, preferred_language)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, address, ward, city, pincode, preferred_language, notification_preferences`,
      [user.id, address, ward, city, pincode, preferred_language]
    );
    const profile = profileRes.rows[0];

    const token = generateToken(user);
    return { user, profile, token };
  } else {
    // In-memory fallback
    if (mockUsers.has(normalizedEmail)) {
      const err = new Error('A user with this email address already exists');
      err.statusCode = 409;
      throw err;
    }

    const userId = `u-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const user = {
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      password_hash: passwordHash,
      role: 'citizen',
      phone,
      is_active: true,
      created_at: new Date().toISOString()
    };
    mockUsers.set(normalizedEmail, user);

    const profile = {
      id: `cp-${userId}`,
      user_id: userId,
      address,
      ward,
      city,
      pincode,
      preferred_language,
      notification_preferences: { email: true, sms: true, whatsapp: false }
    };
    mockCitizenProfiles.set(userId, profile);

    const token = generateToken(user);
    const { password_hash, ...safeUser } = user;
    return { user: safeUser, profile, token };
  }
};

/**
 * Register an admin user with their specialized admin_profile (Option A)
 */
export const registerAdmin = async ({
  name,
  email,
  password,
  phone = null,
  department_id = null,
  employee_id = null,
  designation = 'City Operations Staff',
  is_superadmin = false,
  permissions = { can_assign: true, can_verify: true, can_escalate: true, ai_operations: true }
}) => {
  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await hashPassword(password);

  if (pool) {
    const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      const err = new Error('A user with this email address already exists');
      err.statusCode = 409;
      throw err;
    }

    const userRes = await query(
      `INSERT INTO users (name, email, password_hash, role, phone)
       VALUES ($1, $2, $3, 'admin', $4)
       RETURNING id, name, email, role, phone, is_active, created_at`,
      [name.trim(), normalizedEmail, passwordHash, phone]
    );
    const user = userRes.rows[0];

    // Sync to Supabase Auth (auth.users) so admin appears in Supabase Authentication Dashboard
    if (supabase && env.NODE_ENV !== 'test') {
      try {
        await supabase.auth.admin.createUser({
          id: user.id,
          email: user.email,
          password: password,
          email_confirm: true,
          user_metadata: { name: user.name, role: user.role }
        });
      } catch (authErr) {
        console.warn('Supabase Auth sync notice:', authErr.message);
      }
    }

    const profileRes = await query(
      `INSERT INTO admin_profiles (user_id, department_id, employee_id, designation, is_superadmin, permissions)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, department_id, employee_id, designation, is_superadmin, permissions`,
      [user.id, department_id, employee_id, designation, is_superadmin, JSON.stringify(permissions)]
    );
    const profile = profileRes.rows[0];

    const token = generateToken(user);
    return { user, profile, token };
  } else {
    if (mockUsers.has(normalizedEmail)) {
      const err = new Error('A user with this email address already exists');
      err.statusCode = 409;
      throw err;
    }

    const userId = `u-adm-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const user = {
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      password_hash: passwordHash,
      role: 'admin',
      phone,
      is_active: true,
      created_at: new Date().toISOString()
    };
    mockUsers.set(normalizedEmail, user);

    const profile = {
      id: `ap-${userId}`,
      user_id: userId,
      department_id,
      employee_id: employee_id || `ND-ADM-${Math.floor(100 + Math.random() * 900)}`,
      designation,
      is_superadmin,
      permissions
    };
    mockAdminProfiles.set(userId, profile);

    const token = generateToken(user);
    const { password_hash, ...safeUser } = user;
    return { user: safeUser, profile, token };
  }
};

/**
 * Authenticate user login and return user details with Option A specialized profile
 */
export const loginUser = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();

  let user = null;
  let profile = null;

  if (pool) {
    const userRes = await query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (userRes.rows.length === 0) {
      const err = new Error('Invalid email or password');
      err.statusCode = 401;
      throw err;
    }
    user = userRes.rows[0];

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      const err = new Error('Invalid email or password');
      err.statusCode = 401;
      throw err;
    }

    if (!user.is_active) {
      const err = new Error('Your account has been deactivated. Please contact support.');
      err.statusCode = 403;
      throw err;
    }

    // Update last_login_at
    await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Fetch Option A specialized profile
    if (user.role === 'citizen') {
      const profRes = await query('SELECT * FROM citizen_profiles WHERE user_id = $1', [user.id]);
      profile = profRes.rows[0] || null;
    } else if (user.role === 'admin') {
      const profRes = await query(
        `SELECT ap.*, d.name as department_name, d.code as department_code
         FROM admin_profiles ap
         LEFT JOIN departments d ON ap.department_id = d.id
         WHERE ap.user_id = $1`,
        [user.id]
      );
      profile = profRes.rows[0] || null;
    }
  } else {
    user = mockUsers.get(normalizedEmail);
    if (!user) {
      const err = new Error('Invalid email or password');
      err.statusCode = 401;
      throw err;
    }

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      const err = new Error('Invalid email or password');
      err.statusCode = 401;
      throw err;
    }

    if (!user.is_active) {
      const err = new Error('Your account has been deactivated. Please contact support.');
      err.statusCode = 403;
      throw err;
    }

    if (user.role === 'citizen') {
      profile = mockCitizenProfiles.get(user.id) || null;
    } else if (user.role === 'admin') {
      profile = mockAdminProfiles.get(user.id) || null;
    }
  }

  const { password_hash, ...safeUser } = user;
  const token = generateToken(safeUser);
  return { user: safeUser, profile, token };
};

/**
 * Fetch user by ID with Option A profile
 */
export const getUserById = async (userId) => {
  let user = null;
  let profile = null;

  if (pool) {
    const userRes = await query(
      'SELECT id, name, email, role, phone, avatar_url, is_active, last_login_at, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length === 0) return null;
    user = userRes.rows[0];

    if (user.role === 'citizen') {
      const profRes = await query('SELECT * FROM citizen_profiles WHERE user_id = $1', [user.id]);
      profile = profRes.rows[0] || null;
    } else if (user.role === 'admin') {
      const profRes = await query(
        `SELECT ap.*, d.name as department_name, d.code as department_code
         FROM admin_profiles ap
         LEFT JOIN departments d ON ap.department_id = d.id
         WHERE ap.user_id = $1`,
        [user.id]
      );
      profile = profRes.rows[0] || null;
    }
  } else {
    // In-memory fallback
    for (const u of mockUsers.values()) {
      if (u.id === userId) {
        const { password_hash, ...safeUser } = u;
        user = safeUser;
        profile = user.role === 'citizen'
          ? mockCitizenProfiles.get(user.id)
          : mockAdminProfiles.get(user.id);
        break;
      }
    }
  }

  if (!user) return null;
  return { user, profile };
};

/**
 * Update user and Option A profile details
 */
export const updateProfile = async (userId, {
  name,
  phone,
  address,
  ward,
  city,
  pincode,
  preferred_language,
  designation
}) => {
  if (pool) {
    // 1. Update user record
    const userUpdates = [];
    const userParams = [userId];
    let pIdx = 2;
    if (name) {
      userUpdates.push(`name = $${pIdx++}`);
      userParams.push(name.trim());
    }
    if (phone !== undefined) {
      userUpdates.push(`phone = $${pIdx++}`);
      userParams.push(phone ? phone.trim() : null);
    }
    if (userUpdates.length > 0) {
      userUpdates.push('updated_at = CURRENT_TIMESTAMP');
      await query(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = $1`, userParams);
    }

    const userRes = await query('SELECT role FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) throw new Error('User not found');
    const role = userRes.rows[0].role;

    // 2. Update specialized profile record
    if (role === 'citizen') {
      const profUpdates = [];
      const profParams = [userId];
      let profIdx = 2;
      if (address !== undefined) { profUpdates.push(`address = $${profIdx++}`); profParams.push(address ? address.trim() : null); }
      if (ward !== undefined) { profUpdates.push(`ward = $${profIdx++}`); profParams.push(ward ? ward.trim() : null); }
      if (city !== undefined) { profUpdates.push(`city = $${profIdx++}`); profParams.push(city ? city.trim() : 'Delhi-NCR'); }
      if (pincode !== undefined) { profUpdates.push(`pincode = $${profIdx++}`); profParams.push(pincode ? pincode.trim() : null); }
      if (preferred_language !== undefined) { profUpdates.push(`preferred_language = $${profIdx++}`); profParams.push(preferred_language || 'en'); }

      if (profUpdates.length > 0) {
        profUpdates.push('updated_at = CURRENT_TIMESTAMP');
        await query(`UPDATE citizen_profiles SET ${profUpdates.join(', ')} WHERE user_id = $1`, profParams);
      }
    } else if (role === 'admin') {
      if (designation !== undefined) {
        await query('UPDATE admin_profiles SET designation = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1', [userId, designation.trim()]);
      }
    }

    // Sync name to Supabase Auth metadata
    if (supabase && name && env.NODE_ENV !== 'test') {
      try {
        await supabase.auth.admin.updateUserById(userId, {
          user_metadata: { name: name.trim(), role }
        });
      } catch (authErr) {
        console.warn('Supabase auth metadata update notice:', authErr.message);
      }
    }

    return await getUserById(userId);
  } else {
    // In-memory fallback
    let user = null;
    for (const u of mockUsers.values()) {
      if (u.id === userId) {
        user = u;
        break;
      }
    }
    if (!user) throw new Error('User not found');
    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone;

    let profile = null;
    if (user.role === 'citizen') {
      profile = mockCitizenProfiles.get(userId) || {};
      if (address !== undefined) profile.address = address;
      if (ward !== undefined) profile.ward = ward;
      if (city !== undefined) profile.city = city;
      if (pincode !== undefined) profile.pincode = pincode;
      if (preferred_language !== undefined) profile.preferred_language = preferred_language;
      mockCitizenProfiles.set(userId, profile);
    } else if (user.role === 'admin') {
      profile = mockAdminProfiles.get(userId) || {};
      if (designation !== undefined) profile.designation = designation;
      mockAdminProfiles.set(userId, profile);
    }

    const { password_hash, ...safeUser } = user;
    return { user: safeUser, profile };
  }
};

