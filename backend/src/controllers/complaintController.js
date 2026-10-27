import {
  createComplaint,
  getComplaintsByCitizen,
  getComplaintById,
  addAttachment,
  reopenComplaint
} from '../services/complaintService.js';

/**
 * @route   POST /api/complaints
 * @desc    Submit a new civic complaint
 * @access  Private (Citizen or Admin)
 */
export const create = async (req, res, next) => {
  try {
    const {
      title,
      description,
      category_id,
      department_id,
      location_text,
      landmark,
      ward,
      latitude,
      longitude,
      priority
    } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: { message: 'Title is required and must be at least 5 characters.', statusCode: 400 }
      });
    }

    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: { message: 'Description is required and must be at least 10 characters long.', statusCode: 400 }
      });
    }

    if (!location_text || typeof location_text !== 'string' || location_text.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: { message: 'Location/address or landmark is required.', statusCode: 400 }
      });
    }

    const complaint = await createComplaint({
      userId: req.user.id,
      userName: req.user.name || 'Citizen',
      title,
      description,
      category_id,
      department_id,
      location_text,
      landmark,
      ward,
      latitude,
      longitude,
      priority: priority || 'medium'
    });

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully.',
      data: complaint
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/complaints/mine
 * @desc    Get all complaints submitted by the logged-in citizen
 * @access  Private (Citizen)
 */
export const getMyComplaints = async (req, res, next) => {
  try {
    const result = await getComplaintsByCitizen(req.user.id, req.query);
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/complaints/:id
 * @desc    Get complaint details with timeline & attachments (enforcing ownership)
 * @access  Private (Owner Citizen or Admin)
 */
export const getById = async (req, res, next) => {
  try {
    const result = await getComplaintById(req.params.id, req.user);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: { message: 'Complaint not found.', statusCode: 404 }
      });
    }

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/complaints/:id/attachments
 * @desc    Upload photo/document evidence for a complaint
 * @access  Private (Owner Citizen or Admin)
 */
export const uploadAttachment = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { message: 'No file uploaded. Please provide a photo or PDF document.', statusCode: 400 }
      });
    }

    const attachment = await addAttachment({
      complaintId: req.params.id,
      user: req.user,
      file: req.file,
      attachmentKind: req.body.attachmentKind || 'complaint_evidence'
    });

    res.status(201).json({
      success: true,
      message: 'Attachment uploaded successfully.',
      data: attachment
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/complaints/:id/reopen
 * @desc    Citizen request to reopen a resolved complaint (Workflow D)
 * @access  Private (Owner Citizen or Admin)
 */
export const reopen = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const updated = await reopenComplaint({
      complaintId: req.params.id,
      user: req.user,
      reason
    });

    res.status(200).json({
      success: true,
      message: 'Complaint reopened successfully. City operations and verification have been notified.',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};
