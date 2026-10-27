import express from 'express';
import {
  handleWebhookSuggestion,
  handleWebhookSlaAlert
} from '../controllers/aiController.js';

const router = express.Router();

/**
 * @route   POST /api/webhooks/n8n/suggestions
 * @desc    Receive AI suggestions from n8n workflows
 */
router.post('/n8n/suggestions', handleWebhookSuggestion);

/**
 * @route   POST /api/webhooks/n8n/sla-alert
 * @desc    Receive SLA monitoring flags from n8n Workflow C
 */
router.post('/n8n/sla-alert', handleWebhookSlaAlert);

export default router;
