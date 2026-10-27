import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { query, pool } from '../config/db.js';

// In-memory log of sent emails for local auditing and test verification
export const mockEmailSentLog = [];

/**
 * Configure email transporter
 * Uses SMTP if configured in environment, otherwise falls back to nodemailer JSON test transport
 */
let transporter = null;

const getTransporter = async () => {
  if (transporter) return transporter;

  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT || 587,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      }
    });
  } else {
    // Development / Test JSON transport that doesn't require active external credentials
    transporter = nodemailer.createTransport({
      jsonTransport: true
    });
  }

  return transporter;
};

/**
 * Send 5-day unresponded escalation email to higher municipal authorities
 */
export const sendEscalationEmail = async ({
  to = env.HIGHER_AUTHORITY_EMAIL || 'admin@nagardrishti.gov.in',
  cc = null,
  complaint,
  daysUnresponded = 5,
  escalationReason = null
}) => {
  const mailer = await getTransporter();
  const publicNumber = complaint.public_number || complaint.id || 'N/A';
  const title = complaint.title || 'Untitled civic complaint';
  const category = complaint.category_name || complaint.category || 'General Municipal Issue';
  const department = complaint.department_name || 'Unassigned Municipal Department';
  const location = complaint.location_text || complaint.location || 'Location not specified';
  const landmark = complaint.landmark ? `(Landmark: ${complaint.landmark})` : '';
  const citizen = complaint.reporter_name || complaint.citizen || 'Concerned Citizen';
  const citizenEmail = complaint.reporter_email || complaint.email || 'N/A';
  const citizenPhone = complaint.reporter_phone || complaint.phone || 'N/A';
  const createdDate = complaint.created_at ? new Date(complaint.created_at).toLocaleString('en-IN') : '5+ days ago';
  const portalUrl = `${env.APP_URL || 'http://localhost:3000'}`;
  const fromAddress = env.SMTP_FROM || 'escalations@nagardrishti.gov.in';

  const reason = escalationReason || `Civic issue #${publicNumber} has remained unresponded / stagnant for ${daysUnresponded} consecutive days, breaching municipal SLA response guarantees.`;

  const subject = `🚨 [URGENT ESCALATION] Unattended Civic Complaint #${publicNumber} Exceeded 5 Days Without Response`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
    .header { background: #0f172a; padding: 24px 28px; color: #ffffff; }
    .gov-badge { display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #38bdf8; font-weight: 700; margin-bottom: 6px; }
    .title { margin: 0; font-size: 20px; font-weight: 800; color: #ffffff; }
    .alert-banner { background: #fee2e2; border-left: 5px solid #ef4444; padding: 16px 20px; margin: 20px 28px 10px; border-radius: 6px; }
    .alert-banner h4 { margin: 0 0 6px; color: #991b1b; font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .alert-banner p { margin: 0; color: #7f1d1d; font-size: 13px; line-height: 1.5; }
    .body-content { padding: 15px 28px 25px; }
    .details-table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
    .details-table th, .details-table td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; }
    .details-table th { background: #f8fafc; color: #64748b; font-weight: 600; width: 35%; }
    .details-table td { color: #0f172a; font-weight: 500; }
    .badge-urgent { background: #ef4444; color: #ffffff; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; display: inline-block; }
    .badge-days { background: #f59e0b; color: #ffffff; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; display: inline-block; }
    .action-box { text-align: center; margin: 25px 0 10px; }
    .cta-btn { background: #059669; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block; box-shadow: 0 2px 8px rgba(5,150,105,0.3); }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 28px; font-size: 11px; color: #64748b; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="gov-badge">🏛 Government Municipal Administration • Higher Authority Escalation</div>
      <h1 class="title">Nagar Drishti SLA Breach Escalation</h1>
    </div>

    <div class="alert-banner">
      <h4>🚨 SLA Violation: 5 Days Without Administrative Response</h4>
      <p>${reason}</p>
    </div>

    <div class="body-content">
      <p style="font-size:14px;line-height:1.6;margin-top:0">
        Respected Higher Authority,<br><br>
        The following citizen grievance has remained pending without official intervention or status update for over <strong>${daysUnresponded} days</strong>. Pursuant to municipal accountability protocols, this matter is automatically escalated to your office for urgent review and departmental directive.
      </p>

      <table class="details-table">
        <tr>
          <th>Tracking ID</th>
          <td><strong>#${publicNumber}</strong></td>
        </tr>
        <tr>
          <th>Issue Title</th>
          <td><strong>${title}</strong></td>
        </tr>
        <tr>
          <th>Civic Category</th>
          <td>${category}</td>
        </tr>
        <tr>
          <th>Designated Department</th>
          <td><strong>${department}</strong></td>
        </tr>
        <tr>
          <th>Incident Location</th>
          <td>${location} ${landmark}</td>
        </tr>
        <tr>
          <th>Days Without Response</th>
          <td><span class="badge-days">⏱ ${daysUnresponded} Days Stagnant</span></td>
        </tr>
        <tr>
          <th>Escalated Priority</th>
          <td><span class="badge-urgent">⚡ URGENT ESCALATION</span></td>
        </tr>
        <tr>
          <th>Citizen Reporter</th>
          <td>${citizen} (${citizenEmail} · ${citizenPhone})</td>
        </tr>
        <tr>
          <th>Date Filed</th>
          <td>${createdDate}</td>
        </tr>
      </table>

      <div class="action-box">
        <a href="${portalUrl}" class="cta-btn" target="_blank">
          Open Nagar Drishti Portal to Assign or Intervene ›
        </a>
      </div>
    </div>

    <div class="footer">
      <strong>Autonomous Workflow Audit:</strong> Dispatched by Nagar Drishti Workflow C (5-Day SLA Escalation Automation) on ${new Date().toUTCString()}.<br>
      This is an official administrative transmission. All actions taken on this ticket are logged permanently into the municipal compliance ledger.
    </div>
  </div>
</body>
</html>
`;

  const mailOptions = {
    from: `"Nagar Drishti Escalations" <${fromAddress}>`,
    to: Array.isArray(to) ? to.join(', ') : to,
    ...(cc ? { cc: Array.isArray(cc) ? cc.join(', ') : cc } : {}),
    subject,
    html,
    priority: 'high',
    headers: {
      'X-Priority': '1',
      'X-MSMail-Priority': 'High',
      'Importance': 'high',
      'X-Escalation-Complaint-ID': complaint.id || complaint.backendId || '',
      'X-Escalation-Days': String(daysUnresponded)
    }
  };

  const info = await mailer.sendMail(mailOptions);

  // Store in memory audit log
  const logEntry = {
    timestamp: new Date().toISOString(),
    complaintId: complaint.id || complaint.backendId,
    publicNumber,
    to: mailOptions.to,
    cc: mailOptions.cc || null,
    subject,
    daysUnresponded,
    messageId: info.messageId || `mock-${Date.now()}`
  };
  mockEmailSentLog.push(logEntry);

  // Log in database activity_log if pool is active
  if (pool) {
    try {
      await query(
        `INSERT INTO activity_log (action, entity_type, entity_id, summary, metadata)
         VALUES ('ESCALATION_EMAIL_SENT', 'complaint', $1, $2, $3)`,
        [
          complaint.id || complaint.backendId,
          `Escalation email sent to Higher Authorities (${mailOptions.to}) for complaint ${publicNumber} (5+ days unresponded)`,
          JSON.stringify({
            recipients: mailOptions.to,
            daysUnresponded,
            subject,
            workflow: 'Workflow_C_5Day_Escalation'
          })
        ]
      );
    } catch (dbErr) {
      console.warn('Could not record email activity log in DB:', dbErr.message);
    }
  }

  return {
    success: true,
    messageId: info.messageId,
    recipients: mailOptions.to,
    logEntry
  };
};
