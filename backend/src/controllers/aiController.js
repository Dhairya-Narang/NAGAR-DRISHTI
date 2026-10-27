import {
  saveAiSuggestion,
  getPendingAiSuggestions,
  reviewAiSuggestion,
  handleSlaAlert,
  citizenAiChat
} from '../services/aiService.js';
import { env } from '../config/env.js';

/**
 * @route   POST /api/webhooks/n8n/suggestions
 * @desc    Receive AI recommendation from n8n (Workflow A, B, or D)
 * @access  Webhook / System
 */
export const handleWebhookSuggestion = async (req, res, next) => {
  try {
    // Verify webhook secret if in production or if secret header is supplied
    if (env.isProduction && env.N8N_WEBHOOK_SECRET && env.N8N_WEBHOOK_SECRET !== 'your_n8n_shared_secret') {
      const secret = req.headers['x-webhook-secret'];
      if (secret !== env.N8N_WEBHOOK_SECRET) {
        return res.status(401).json({
          success: false,
          error: { message: 'Unauthorized: Invalid webhook secret header.', statusCode: 401 }
        });
      }
    }

    const {
      complaint_id,
      workflow_name,
      suggestion_type,
      suggestion_data,
      confidence_score
    } = req.body;

    if (!complaint_id || !suggestion_type || !suggestion_data) {
      return res.status(400).json({
        success: false,
        error: { message: 'complaint_id, suggestion_type, and suggestion_data are required.', statusCode: 400 }
      });
    }

    const suggestion = await saveAiSuggestion({
      complaintId: complaint_id,
      workflowName: workflow_name || 'Workflow_A_Classification',
      suggestionType: suggestion_type,
      suggestionData: suggestion_data,
      confidenceScore: confidence_score || 0.85
    });

    res.status(201).json({
      success: true,
      message: 'AI suggestion received and logged for human review.',
      data: suggestion
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/webhooks/n8n/sla-alert
 * @desc    Receive overdue / SLA risk flag from Workflow C
 * @access  Webhook / System
 */
export const handleWebhookSlaAlert = async (req, res, next) => {
  try {
    const { complaint_id, alert_type, breach_hours } = req.body;

    if (!complaint_id) {
      return res.status(400).json({
        success: false,
        error: { message: 'complaint_id is required.', statusCode: 400 }
      });
    }

    const result = await handleSlaAlert({
      complaintId: complaint_id,
      alertType: alert_type || 'sla_risk',
      breachHours: breach_hours || 0
    });

    res.status(200).json({
      success: true,
      message: 'SLA alert processed and logged.',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/ai/pending
 * @desc    Get all AI suggestions awaiting human review
 * @access  Private (Admin)
 */
export const getPendingSuggestions = async (req, res, next) => {
  try {
    const suggestions = await getPendingAiSuggestions();
    res.status(200).json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/admin/ai/review/:id
 * @desc    Human review of an AI suggestion (Accept, Reject, Modify)
 * @access  Private (Admin)
 */
export const reviewSuggestion = async (req, res, next) => {
  try {
    const { decision, feedback_notes } = req.body;

    if (!decision) {
      return res.status(400).json({
        success: false,
        error: { message: "decision ('accepted', 'rejected', 'modified') is required.", statusCode: 400 }
      });
    }

    const result = await reviewAiSuggestion({
      suggestionId: req.params.id,
      decision,
      feedbackNotes: feedback_notes,
      adminUser: req.user
    });

    res.status(200).json({
      success: true,
      message: `AI suggestion ${decision} successfully.`,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/ai/chat
 * @desc    Citizen AI chat assistant grounded in authorized municipal knowledge
 * @access  Private (Authenticated)
 */
export const citizenChat = async (req, res, next) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: { message: 'question is required.', statusCode: 400 }
      });
    }

    const reply = await citizenAiChat({
      userId: req.user.id,
      userName: req.user.name,
      question
    });

    res.status(200).json({
      success: true,
      data: reply
    });
  } catch (error) {
    next(error);
  }
};
