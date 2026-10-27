import {
  registerCitizen,
  registerAdmin,
  loginUser,
  getUserById,
  updateProfile
} from '../services/authService.js';

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (Citizen by default, or Admin)
 * @access  Public
 */
export const register = async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      role = 'citizen',
      phone,
      // Citizen profile fields (Option A)
      address,
      ward,
      city,
      pincode,
      preferred_language,
      // Admin profile fields (Option A)
      department_id,
      employee_id,
      designation,
      admin_enrollment_key
    } = req.body;

    // Basic Validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: { message: 'Name is required and must be at least 2 characters long.', statusCode: 400 }
      });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        error: { message: 'A valid email address is required.', statusCode: 400 }
      });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: { message: 'Password must be at least 6 characters long.', statusCode: 400 }
      });
    }

    let result;
    if (role === 'admin') {
      result = await registerAdmin({
        name,
        email,
        password,
        phone,
        department_id,
        employee_id,
        designation,
        is_superadmin: false
      });
    } else {
      result = await registerCitizen({
        name,
        email,
        password,
        phone,
        address,
        ward,
        city,
        pincode,
        preferred_language
      });
    }

    res.status(201).json({
      success: true,
      message: `${role.charAt(0).toUpperCase() + role.slice(1)} registered successfully.`,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/login
 * @desc    Log in user and return JWT with Option A profile
 * @access  Public
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { message: 'Email and password are required.', statusCode: 400 }
      });
    }

    const result = await loginUser({ email, password });

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/logout
 * @desc    Log out user / client session invalidation
 * @access  Public
 */
export const logout = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully. Please remove the auth token from client storage.'
  });
};

/**
 * @route   GET /api/auth/me
 * @desc    Get currently logged in user profile and permissions
 * @access  Private (Authenticated)
 */
export const getMe = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userData = await getUserById(userId);

    if (!userData) {
      return res.status(404).json({
        success: false,
        error: { message: 'User not found.', statusCode: 404 }
      });
    }

    res.status(200).json({
      success: true,
      data: userData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/auth/profile
 * @desc    Update current user profile
 * @access  Private (Authenticated)
 */
export const updateMe = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, phone, address, ward, city, pincode, preferred_language, designation } = req.body;
    const updated = await updateProfile(userId, {
      name,
      phone,
      address,
      ward,
      city,
      pincode,
      preferred_language,
      designation
    });
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

