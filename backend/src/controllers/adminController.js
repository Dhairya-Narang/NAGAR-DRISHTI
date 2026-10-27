import {
  listAdminComplaints,
  assignDepartment,
  resolveComplaint,
  verifyResolution,
  escalateComplaint,
  assignCluster,
  resolveCluster
} from '../services/adminService.js';

/**
 * @route   GET /api/admin/complaints
 * @desc    Filter and search all complaints for administration
 * @access  Private (Admin)
 */
export const list = async (req, res, next) => {
  try {
    const result = await listAdminComplaints(req.query);
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/admin/complaints/:id/assign
 * @desc    Assign a complaint to a department and/or official
 * @access  Private (Admin)
 */
export const assign = async (req, res, next) => {
  try {
    const { department_id, assigned_to_admin_id, notes } = req.body;

    if (!department_id) {
      return res.status(400).json({
        success: false,
        error: { message: 'department_id is required for assignment.', statusCode: 400 }
      });
    }

    const updated = await assignDepartment({
      complaintId: req.params.id,
      departmentId: department_id,
      assignedToAdminId: assigned_to_admin_id,
      adminUser: req.user,
      notes
    });

    res.status(200).json({
      success: true,
      message: 'Complaint assigned to department successfully.',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/admin/complaints/:id/resolve
 * @desc    Mark complaint as resolved with closure notes and optional evidence
 * @access  Private (Admin)
 */
export const resolve = async (req, res, next) => {
  try {
    const { resolution_notes, resolution_proof_url } = req.body;

    if (!resolution_notes) {
      return res.status(400).json({
        success: false,
        error: { message: 'resolution_notes are mandatory to resolve a complaint.', statusCode: 400 }
      });
    }

    const updated = await resolveComplaint({
      complaintId: req.params.id,
      resolutionNotes: resolution_notes,
      resolutionProofUrl: resolution_proof_url,
      adminUser: req.user
    });

    res.status(200).json({
      success: true,
      message: 'Complaint marked as resolved. Sent to verification queue.',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/admin/complaints/:id/verify
 * @desc    Approve or reject resolution in Verification Queue
 * @access  Private (Admin)
 */
export const verify = async (req, res, next) => {
  try {
    const { decision, notes } = req.body;

    if (!['verified', 'rejected'].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: { message: "decision must be either 'verified' or 'rejected'.", statusCode: 400 }
      });
    }

    const updated = await verifyResolution({
      complaintId: req.params.id,
      decision,
      verificationNotes: notes,
      adminUser: req.user
    });

    res.status(200).json({
      success: true,
      message: `Complaint resolution ${decision} successfully.`,
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/admin/complaints/:id/escalate
 * @desc    Escalate an overdue or critical complaint
 * @access  Private (Admin)
 */
export const escalate = async (req, res, next) => {
  try {
    const { reason } = req.body;

    const updated = await escalateComplaint({
      complaintId: req.params.id,
      escalationReason: reason,
      adminUser: req.user
    });

    res.status(200).json({
      success: true,
      message: 'Complaint escalated successfully.',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/admin/clusters/assign
 * @desc    Batch assign all complaints in a duplicate incident cluster to a department
 * @access  Private (Admin)
 */
export const batchAssign = async (req, res, next) => {
  try {
    const { complaint_ids, department_id, notes } = req.body;
    if (!Array.isArray(complaint_ids) || complaint_ids.length === 0 || !department_id) {
      return res.status(400).json({
        success: false,
        error: { message: 'complaint_ids array and department_id are required.', statusCode: 400 }
      });
    }

    const updated = await assignCluster({
      complaintIds: complaint_ids,
      departmentId: department_id,
      adminUser: req.user,
      notes
    });

    res.status(200).json({
      success: true,
      message: `Assigned ${updated.length} complaints in incident cluster.`,
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/admin/clusters/resolve
 * @desc    Batch resolve all complaints in a duplicate incident cluster
 * @access  Private (Admin)
 */
export const batchResolve = async (req, res, next) => {
  try {
    const { complaint_ids, resolution_notes } = req.body;
    if (!Array.isArray(complaint_ids) || complaint_ids.length === 0 || !resolution_notes) {
      return res.status(400).json({
        success: false,
        error: { message: 'complaint_ids array and resolution_notes are required.', statusCode: 400 }
      });
    }

    const updated = await resolveCluster({
      complaintIds: complaint_ids,
      resolutionNotes: resolution_notes,
      adminUser: req.user
    });

    res.status(200).json({
      success: true,
      message: `Resolved ${updated.length} complaints in incident cluster.`,
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

