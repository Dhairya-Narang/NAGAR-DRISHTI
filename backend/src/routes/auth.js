import express from 'express';
import { register, login, logout, getMe, updateMe } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new citizen or admin
 * @access  Public
 */
router.post('/register', register);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user & return JWT token
 * @access  Public
 */
router.post('/login', login);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout instruction
 * @access  Public
 */
router.post('/logout', logout);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile and role details
 * @access  Private
 */
router.get('/me', authenticateToken, getMe);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile and details
 * @access  Private
 */
router.put('/profile', authenticateToken, updateMe);

export default router;
