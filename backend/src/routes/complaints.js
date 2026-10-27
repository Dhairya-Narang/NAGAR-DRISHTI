import express from 'express';
import {
  create,
  getMyComplaints,
  getById,
  uploadAttachment,
  reopen
} from '../controllers/complaintController.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadAttachmentMiddleware } from '../middleware/upload.js';

const router = express.Router();

// All complaint operations require authentication
router.use(authenticateToken);

/**
 * @route   POST /api/complaints
 * @desc    Submit a new complaint
 */
router.post('/', create);

/**
 * @route   GET /api/complaints/mine
 * @desc    Get all complaints reported by authenticated citizen
 */
router.get('/mine', getMyComplaints);

/**
 * @route   GET /api/complaints/:id
 * @desc    Get complaint details with timeline & attachments
 */
router.get('/:id', getById);

/**
 * @route   POST /api/complaints/:id/attachments
 * @desc    Upload evidence photo or document
 */
router.post('/:id/attachments', uploadAttachmentMiddleware.single('file'), uploadAttachment);

/**
 * @route   POST /api/complaints/:id/reopen
 * @desc    Reopen a resolved complaint
 */
router.post('/:id/reopen', reopen);

export default router;
