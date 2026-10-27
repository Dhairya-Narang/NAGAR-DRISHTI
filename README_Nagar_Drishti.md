# Nagar Drishti
### Har Shikayat Par Nazar. Har Samasya Ka Samadhan.

**Hackoween — Alta School of Technology**  
**Project Planning Document | Smart Cities | Agentic AI**

> **Project status:** The frontend is connected to the backend API for authentication, complaint reporting and tracking, admin operations, dashboards, notifications, and AI recommendation review. The broader workflow and product ideas below remain proposals unless explicitly described as implemented and tested.

---

## 1. Project Overview

**Nagar Drishti** is a civic issue reporting and resolution platform designed to help citizens report local problems and help city operations teams manage those reports from submission through verified resolution.

Citizens may report issues such as:
- Road damage and potholes
- Garbage and waste management
- Water leakage or water supply issues
- Electricity issues
- Broken streetlights
- Public infrastructure problems
- Other civic issues

The platform aims to improve complaint handling by identifying related reports, suggesting the appropriate department, tracking deadlines, supporting verification, and highlighting cases that may need escalation or reopening.

### The problem

Civic complaints can be difficult to manage when reports are duplicated, assigned to the wrong department, left pending, or marked resolved without sufficient evidence that the issue has been addressed.

Nagar Drishti proposes a centralized workflow that keeps the complaint record, its status history, evidence, and follow-up actions connected.

### Proposed solution

A web platform with separate citizen and administrator experiences, supported by database-backed records and n8n workflows for AI-assisted analysis and coordination.

---

## 2. Goals

- Make it easy for citizens to submit and track civic complaints.
- Help administrators organize complaints and assign them to departments.
- Identify possible duplicate or related complaints.
- Provide AI-assisted category, department, priority, and summary suggestions.
- Track service-level deadlines (SLAs) and flag overdue cases.
- Preserve complaint history and accountability.
- Support resolution verification and reopening when a problem remains unresolved.
- Provide an AI assistant grounded in authorized application data.

## 3. Proposed Technology Stack

| Layer | Technology | Planned responsibility |
|---|---|---|
| Frontend | HTML, CSS, JavaScript | Citizen portal and admin dashboard |
| AI/workflow automation | n8n | Orchestrate AI-assisted workflows, checks, and notifications |
| Database | Supabase PostgreSQL | Store users, complaints, departments, history, notifications, and AI review logs |
| Backend/API | Render | Host the application API and backend services |
| AI model | Model/API supported by n8n | Understand complaints and generate grounded suggestions |
| Version control | GitHub | Source code, planning, issues, and project documentation |

**Architecture note:** Supabase provides the PostgreSQL database, and the backend API is configured for Render deployment. n8n can orchestrate workflows and call the application API. The browser frontend communicates with the backend API; it must not contain database credentials or other privileged secrets.

The final choice of AI provider and deployment configuration will depend on available free tiers, limits, and hackathon requirements.

---

## 4. System Architecture

```text
Citizen / Admin
      |
      v
HTML + CSS + JavaScript Frontend
      |
      v
Backend API hosted on Render
      |
      +----------------------> Supabase PostgreSQL
      |                       - Users and roles
      |                       - Complaints
      |                       - Departments
      |                       - Status history
      |                       - Attachments metadata
      |                       - Notifications
      |                       - AI review logs
      |
      v
n8n Workflow Automation
      |
      +--> Complaint understanding / classification
      +--> Possible duplicate detection
      +--> Department and priority suggestions
      +--> SLA/deadline monitoring
      +--> Verification and escalation workflows
      +--> Notifications
      |
      v
AI model / authorized tools
```

### Key boundaries

- The backend API is responsible for authentication, authorization, validation, and official database changes.
- n8n coordinates workflows and produces AI suggestions.
- AI suggestions do not directly change official complaint status, priority, or assignment without authorized approval.
- The database is the source of truth for complaint status and dashboard metrics.
- Citizens may only access complaints and information they are authorized to view.

---

## 5. User Roles

### Citizen / User

Can:
- Register and sign in.
- Submit a civic complaint.
- Select a category and provide title, description, and location.
- Attach optional photo or other supported evidence.
- View their own complaints.
- Track status and timeline.
- Receive notifications.
- Ask the citizen AI assistant for guidance.
- Request reopening or submit follow-up evidence where supported.

### Admin / City Operations

Can:
- View and filter complaints.
- Review AI suggestions.
- Assign or change department.
- Set or override priority.
- Set deadlines.
- Update status and add notes.
- Review evidence and verify resolution.
- Escalate overdue cases.
- Reopen complaints when appropriate.
- View activity, department, and priority summaries.
- Review AI operation and audit logs.

---

## 6. Planned Frontend

### Citizen dashboard

Planned pages and components:
- Home dashboard
- Report Issue form
- My Complaints
- Complaint detail and tracking timeline
- Notifications
- Profile
- Citizen AI Assistant

The complaint form is planned to include:
- Category
- Short title
- Description
- Location/address or landmark
- Optional evidence attachment
- Submit confirmation and unique complaint ID

### Admin dashboard

Planned pages and components:
- Dashboard summary
- Complaints table
- Incident/related-report view
- Department management
- Verification queue
- AI Operations Centre
- Reports
- Settings

Planned dashboard metrics:
- Total complaints
- Resolved
- Pending
- In Progress
- Priority breakdown
- Department-wise summary
- Recent activity
- Overdue and reopened cases
- AI suggestions awaiting review

**Admin dashboard constraint:** The admin dashboard will not include a map. It will use the available space for complaint status, priority, department summaries, recent activities, and AI Operations.

### Visual direction

- White background with green and mint accents
- Primary green: `#168A50`
- Dark green: `#075B39`
- Mint: `#EAF7EF`
- Light background: `#F7FAF8`
- Rounded cards and subtle borders/shadows
- Responsive layouts for desktop, tablet, and mobile
- Clear status and priority labels; status must not rely on color alone

---

## 7. Planned AI Agent and n8n Workflows

n8n will be used to coordinate AI-assisted tasks and application actions. The initial scope is to create workflows that can be inspected, tested, and audited.

### Workflow A — New complaint processing

**Trigger:** Backend receives a new complaint.

Proposed steps:
1. Receive complaint ID and permitted complaint fields from the backend.
2. Ask the AI to summarize the issue and suggest a category.
3. Suggest a department based on the category and configured rules.
4. Suggest a priority with a brief rationale.
5. Check for potentially related existing complaints.
6. Store suggestions in an AI review record.
7. Notify the admin dashboard that suggestions are ready for review.

**Human approval:** An authorized admin reviews and accepts or rejects suggestions before official assignment or priority changes.

### Workflow B — Duplicate / related complaint detection

**Trigger:** New complaint or an admin requests a related-incident check.

Proposed steps:
1. Search existing complaints using category, location, status, and relevant text.
2. Compare candidate records with AI-assisted similarity analysis.
3. Return possible matches with reasons and confidence.
4. Record the suggestion for review.
5. Allow an authorized admin to link reports to a common incident.

The system should not automatically merge uncertain reports. The original complaint records and history must be preserved.

### Workflow C — SLA monitoring and escalation

**Trigger:** Scheduled n8n workflow or backend event.

Proposed steps:
1. Retrieve authorized active complaints and their due dates.
2. Identify approaching or missed deadlines.
3. Record an SLA risk or overdue event.
4. Notify the responsible admin or department.
5. Suggest escalation or reassignment.
6. Require authorized review before official escalation or reassignment, unless a clearly defined approved rule permits the action.

### Workflow D — Resolution verification and reopening

**Trigger:** Department marks a complaint as resolved, or new evidence/report is submitted.

Proposed steps:
1. Retrieve the complaint's permitted closure notes and evidence.
2. Check whether required evidence is present.
3. Compare new reports or evidence with the closure record.
4. Produce a verification recommendation and explanation.
5. Send uncertain or contradictory cases to the verification queue.
6. Allow an authorized admin to verify, reject, or reopen the complaint.
7. Preserve the complete status history.

AI must not claim a complaint is resolved unless the official record says so.

### Workflow E — Citizen AI assistant

**Trigger:** Citizen submits a question through the frontend.

Proposed steps:
1. Backend verifies the user's identity and permissions.
2. Retrieve relevant FAQ or authorized complaint data.
3. Send only necessary context to the AI workflow.
4. Generate a grounded response.
5. Return the answer through the backend.
6. Log the interaction as appropriate.

The assistant can explain categories, complaint statuses, delays, and how to submit follow-up evidence. It should not expose another citizen's private complaint.

### n8n workflow design principles

- Use authenticated backend endpoints or scoped credentials.
- Keep secrets in environment variables or n8n credentials.
- Validate inputs and outputs.
- Include error handling and retry behavior.
- Avoid duplicate actions on workflow retries.
- Record workflow execution and AI suggestion outcomes.
- Do not put privileged database credentials in browser code.
- Use human approval for consequential actions.

---

## 8. Proposed Data Model

The following tables are planned for Supabase PostgreSQL. The exact schema and migrations will be finalized during implementation.

### users
- `id`
- `name`
- `email`
- `role`
- `created_at`
- `notification_preferences`

### complaints
- `id`
- `public_number`
- `reporter_user_id`
- `title`
- `description`
- `category_id`
- `location_text`
- `priority`
- `status`
- `department_id`
- `created_at`
- `updated_at`
- `due_at`
- `resolved_at`
- `resolution_notes`
- `verification_status`

### categories
- `id`
- `name`
- `description`
- `active`

### departments
- `id`
- `name`
- `queue_or_contact_details`
- `active`

### attachments
- `id`
- `complaint_id`
- `storage_key_or_url`
- `file_type`
- `uploaded_by`
- `uploaded_at`

### status_history
- `id`
- `complaint_id`
- `old_status`
- `new_status`
- `changed_by`
- `note`
- `timestamp`

### activity_log
- `id`
- `actor`
- `action`
- `entity_type`
- `entity_id`
- `summary`
- `timestamp`

### notifications
- `id`
- `recipient_user_id`
- `complaint_id`
- `title`
- `message`
- `type`
- `read_at`
- `created_at`

### ai_review_log
- `id`
- `complaint_id`
- `suggestion_type`
- `suggestion_summary_or_data`
- `reviewer`
- `decision`
- `created_at`

### sla_rules
- `id`
- `category_or_priority`
- `response_target`
- `resolution_target`
- `escalation_threshold`
- `enabled`

---

## 9. Backend API

The backend implements the following routes. See [backend/README.md](./backend/README.md) for request details and setup instructions.

### Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Citizen complaints
- `POST /api/complaints`
- `GET /api/complaints/mine`
- `GET /api/complaints/:id`
- `POST /api/complaints/:id/attachments`
- `POST /api/complaints/:id/reopen`

### Admin operations
- `GET /api/admin/complaints`
- `POST /api/admin/complaints/:id/assign`
- `POST /api/admin/complaints/:id/resolve`
- `POST /api/admin/complaints/:id/verify`
- `POST /api/admin/complaints/:id/escalate`

### Dashboards and reports
- `GET /api/dashboard/citizen-summary`
- `GET /api/admin/dashboard-summary`
- `GET /api/admin/activities`
- `GET /api/admin/departments`

### Notifications and AI
- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`
- `PATCH /api/notifications/read-all`
- `POST /api/ai/chat`
- `GET /api/admin/ai/pending`
- `POST /api/admin/ai/review/:id`

All routes must enforce authorization on the backend.

## Running the Connected Frontend and Backend

1. Configure and start the API as described in [backend/README.md](./backend/README.md). The API listens on `http://localhost:5000` by default.
2. In a second terminal, serve the frontend:

   ```bash
   python3 -m http.server 8000 --directory frontend
   ```

3. Open `http://localhost:8000`. The frontend calls `http://localhost:5000/api` by default. To use a different backend, set `window.NAGAR_DRISHTI_API_URL` in [frontend/config.js](./frontend/config.js) to the API base URL, including `/api`.
4. Set `CORS_ORIGIN=http://localhost:8000` in `backend/.env` when using this local frontend origin. For persistent shared accounts and complaints, configure the database and apply the schema and seed data as described in the backend guide.

---

## 10. Complaint Lifecycle

Planned statuses:
- **Pending**
- **In Progress**
- **Resolved**
- **Reopened**

A status change should create a history record with the actor, timestamp, and optional note.

### Example lifecycle

```text
Complaint Submitted
       |
       v
     Pending
       |
       v
   In Progress
       |
       v
    Resolved
       |
       +---- Evidence / citizen report contradicts closure
       |
       v
    Reopened
       |
       v
   In Progress
       |
       v
    Resolved
```

AI may recommend an action. Official status changes must be performed by an authorized person or by an explicitly approved rule.

---

## 11. Build Plan

### Phase 1 — Repository and foundation
- Create GitHub repository.
- Set up frontend and backend folders.
- Configure Supabase PostgreSQL.
- Plan authentication and roles.
- Create initial schema and seed data.
- Document environment variables.

### Phase 2 — Citizen frontend
- Build dashboard.
- Build complaint submission form.
- Build My Complaints and detail/timeline pages.
- Add validation and loading/error states.
- Connect frontend to backend APIs.

### Phase 3 — Admin frontend
- Build dashboard cards and summaries.
- Build complaint table and filters.
- Add department assignment and status updates.
- Add verification and escalation views.
- Add activity feed and AI Operations Centre.

### Phase 4 — Backend and database integration
- Implement APIs.
- Add server-side authorization.
- Persist complaints, attachments metadata, history, and notifications.
- Ensure dashboard counts use database values.
- Add audit logs.

### Phase 5 — n8n and AI workflows
- New complaint analysis.
- Related/duplicate report suggestions.
- Department and priority recommendations.
- SLA monitoring and risk flags.
- Verification recommendations.
- Citizen AI assistant.
- Admin review and audit flow.

### Phase 6 — Testing and deployment
- Test citizen/admin access boundaries.
- Test complaint submission and lifecycle.
- Test duplicate suggestions.
- Test overdue and escalation workflow.
- Test reopening and evidence review.
- Add realistic demo seed data.
- Deploy backend to Render.
- Configure n8n and Supabase.
- Prepare GitHub README, screenshots, and demo instructions.

---

## 12. Testing Plan

Planned tests include:

- Citizen can submit a complaint and receive a unique ID.
- Citizen can only access their own complaints.
- Admin can access authorized admin functions.
- Required fields and file uploads are validated.
- Complaint status history is preserved.
- Dashboard totals match database records.
- AI recommendations are grounded in available records.
- Duplicate detection returns suggestions rather than silently merging.
- Missed deadlines are flagged.
- Contradictory closure evidence reaches verification.
- Reopened complaints preserve the prior history.
- Workflow retries do not create duplicate notifications or actions.
- Loading, empty, validation, network error, and retry states are handled.

---

## 13. Privacy, Safety, and Reliability

- Keep API keys and database credentials out of frontend JavaScript and GitHub.
- Use environment variables and provide `.env.example` with placeholder values only.
- Enforce role permissions on the backend.
- Citizens must not access other citizens' private complaints.
- Validate uploaded file type and size.
- Avoid sending unnecessary personal data to AI providers.
- Treat AI output as a suggestion, not an authoritative record.
- Preserve status and activity history.
- Use server timestamps.
- Clearly identify demo/seed data.
- Do not claim unimplemented features work.

---

## 14. Hackathon Demo Plan

A proposed demo scenario:

1. A citizen submits a road-damage complaint.
2. The AI workflow suggests category, department, and priority.
3. Two more reports are submitted for the same area.
4. The system flags possible related complaints.
5. An admin reviews and links the reports.
6. The department marks the incident In Progress.
7. A simulated deadline is missed and the system flags the incident.
8. The department submits closure notes and evidence.
9. A new citizen report contradicts the closure.
10. The verification workflow recommends reopening.
11. The admin reopens the complaint.
12. The dashboard and activity log show the complete process.

The demo should use clearly labeled fictional data and a simulated clock for deadlines.

---

## 15. Definition of Done

The project will be considered ready for the hackathon demo when:

- [ ] Citizen can submit and track a complaint.
- [ ] Admin can view and manage complaints.
- [ ] Database-backed dashboard counts are consistent.
- [ ] Complaint status history is preserved.
- [ ] n8n can run the planned AI-assisted workflows.
- [ ] AI suggestions are shown for human review.
- [ ] Deadline monitoring can flag overdue cases.
- [ ] Verification/reopening flow can be demonstrated.
- [ ] Role-based access is tested.
- [ ] README and setup instructions are complete.
- [ ] Demo data and demo steps are prepared.
- [ ] Planned versus implemented features are clearly documented.

---

## 16. Repository Structure (Proposed)

```text
nagar-drishti/
├── frontend/
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── assets/
├── backend/
│   ├── src/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   └── tests/
├── n8n/
│   └── workflows/
├── database/
│   ├── schema.sql
│   └── seed.sql
├── docs/
│   ├── project-planning.md
│   └── demo-plan.md
├── .env.example
├── .gitignore
└── README.md
```

This is a proposed structure and may change as the implementation begins.

---

## 17. About

**Nagar Drishti** is a proposed Smart Cities project for **Hackoween at Alta School of Technology**.

**Tagline:** Har Shikayat Par Nazar. Har Samasya Ka Samadhan.

The project aims to demonstrate how a civic issue reporting platform can use AI-assisted workflows, structured records, and verification to improve accountability from complaint submission to resolution.

---

## Acknowledgement

Built as a hackathon project concept by the Nagar Drishti team.

*This document describes the project plan and intended architecture. Implementation details, providers, deployment configuration, and features may change during development.*
