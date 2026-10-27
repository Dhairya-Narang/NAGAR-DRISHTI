import {
  getCitizenDashboardSummary,
  getAdminDashboardSummary,
  getAdminActivities,
  getDepartmentsList
} from '../services/dashboardService.js';

/**
 * @route   GET /api/dashboard/citizen-summary
 * @desc    Get citizen home summary, stats, and recent complaints
 * @access  Private
 */
export const getCitizenSummary = async (req, res, next) => {
  try {
    const summary = await getCitizenDashboardSummary(req.user.id);
    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/dashboard-summary
 * @desc    Get real-time municipal dashboard metrics & department workload
 * @access  Private (Admin)
 */
export const getAdminSummary = async (req, res, next) => {
  try {
    const summary = await getAdminDashboardSummary();
    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/activities
 * @desc    Get paginated municipal activity log feed
 * @access  Private (Admin)
 */
export const getActivities = async (req, res, next) => {
  try {
    const result = await getAdminActivities(req.query);
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/departments
 * @desc    Get all active municipal departments
 * @access  Private (Admin or Authenticated)
 */
export const getDepartments = async (req, res, next) => {
  try {
    const departments = await getDepartmentsList();
    res.status(200).json({
      success: true,
      data: departments
    });
  } catch (error) {
    next(error);
  }
};
