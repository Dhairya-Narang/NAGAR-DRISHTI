# Nagar Drishti — Backend API Service

> *"Har Shikayat Par Nazar. Har Samasya Ka Samadhan."*

Robust, production-grade REST API backend for **Nagar Drishti** (Civic Issue Reporting & Resolution Platform), engineered with Node.js, Express, PostgreSQL / Supabase, and n8n AI workflow automation.

---

## Architecture Highlights

1. **Option A Data Modeling**: Dedicated profile tables (`citizen_profiles` and `admin_profiles`) separate from the central `users` authentication table for crisp role separation.
2. **Role Barrier Security**: Citizens can only access their own complaints; administrative routes enforce strict `403 Forbidden` guards.
3. **Human-in-the-Loop AI**: n8n automated AI suggestions (classification, duplicates, verification) are routed to the **AI Operations Centre** for human supervisor review before mutating official civic records.
4. **Resilient Dual-Engine Data Layer**: Connects natively to live Supabase PostgreSQL via connection pooling and `@supabase/supabase-js`, with an automated in-memory store for instant offline development and testing.

---

## Directory Structure

```text
backend/
├── src/
│   ├── config/          # Environment variables & PostgreSQL/Supabase clients
│   ├── controllers/     # HTTP route handlers (auth, complaints, admin, dashboard, AI)
│   ├── middleware/      # JWT auth, role guards, file uploads (Multer), error handlers
│   ├── routes/          # Express route definitions
│   ├── scripts/         # Cloud seeding script (seed.js)
│   ├── services/        # Core business logic & n8n webhook dispatchers
│   ├── app.js           # Express app configuration & middleware mounts
│   └── server.js        # Server bootstrap & graceful shutdown handler
├── tests/               # 66 comprehensive unit, integration & E2E tests
├── .env.example         # Environment template with documentation
├── package.json
└── README.md
```

---

## Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your Supabase project credentials:
```env
PORT=5000
NODE_ENV=development
JWT_SECRET=your_jwt_secret_key
SUPABASE_URL=https://[YOUR_PROJECT_REF].supabase.co
SUPABASE_ANON_KEY=[YOUR_ANON_KEY]
SUPABASE_SERVICE_ROLE_KEY=[YOUR_SERVICE_ROLE_KEY]
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR_PROJECT_REF].supabase.co:5432/postgres
N8N_WEBHOOK_BASE_URL=https://n8n.your-domain.com/webhook
N8N_WEBHOOK_SECRET=your_shared_webhook_secret
```

### 3. Seed Supabase Cloud Database
Populate your Supabase PostgreSQL cloud database with realistic demo records (departments, categories, SLA rules, demo users, and complaints):
```bash
npm run seed
```

### 4. Run Development Server
```bash
npm run dev
```
The server will start at `http://localhost:5000`.

---

## API Endpoints Reference

### 🔐 1. Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register Citizen or Admin (creates Option A profile) |
| `POST` | `/api/auth/login` | Public | Authenticate user & return signed JWT |
| `POST` | `/api/auth/logout` | Authenticated | Logout user |
| `GET` | `/api/auth/me` | Authenticated | Retrieve current user profile & role |

#### Demo Credentials:
- **Chief Admin**: `admin@nagardrishti.gov.in` / `Admin@1234`
- **PWD Engineer**: `pwd.officer@nagardrishti.gov.in` / `Admin@1234`
- **Citizen Vikram**: `citizen@example.com` / `Citizen@1234`
- **Citizen Priya**: `priya.sharma@example.com` / `Citizen@1234`

---

### 📝 2. Citizen Complaints (`/api/complaints`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/complaints` | Citizen | Submit a new complaint (triggers n8n Workflow A) |
| `GET` | `/api/complaints/mine` | Citizen | List complaints submitted by logged-in citizen |
| `GET` | `/api/complaints/:id` | Owner / Admin | View complaint details, attachments, & full audit timeline |
| `POST` | `/api/complaints/:id/attachments` | Owner / Admin | Upload photo/document evidence (Multer, max 10MB) |
| `POST` | `/api/complaints/:id/reopen` | Owner | Reopen resolved complaint (triggers n8n Workflow D) |

---

### 🏛️ 3. Admin Operations (`/api/admin`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/admin/complaints` | Admin | Filter & search complaints by status, priority, dept, ward, overdue |
| `PATCH` | `/api/admin/complaints/:id` | Admin | Update complaint fields (priority, SLA due date, notes) |
| `POST` | `/api/admin/complaints/:id/assign` | Admin | Assign department & engineer (advances status to `In Progress`) |
| `POST` | `/api/admin/complaints/:id/resolve` | Admin | Mark resolved with closure notes (sends to Verification Queue) |
| `POST` | `/api/admin/complaints/:id/verify` | Admin | Approve or reject resolution in Verification Queue |
| `POST` | `/api/admin/complaints/:id/escalate`| Admin | Escalate overdue/critical complaint to `urgent` |

---

### 📊 4. Dashboards & Analytics (`/api/dashboard` & `/api/admin`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/dashboard/citizen-summary` | Citizen | Metrics (total, pending, resolved), recent reports, unread alerts |
| `GET` | `/api/admin/dashboard-summary` | Admin | City totals, SLA breaches, Verification Queue, AI pending reviews |
| `GET` | `/api/admin/activities` | Admin | Real-time audit trail activity feed |
| `GET` | `/api/admin/departments` | Admin | Municipal departments directory & active status |

---

### 🔔 5. Notifications (`/api/notifications`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/notifications` | Authenticated | List user notifications & unread count |
| `PATCH` | `/api/notifications/:id/read` | Authenticated | Mark a single notification as read |
| `PATCH` | `/api/notifications/read-all` | Authenticated | Mark all notifications as read |

---

### 🤖 6. AI Operations & Assistant (`/api/ai` & `/api/admin/ai`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/ai/chat` | Authenticated | Citizen AI assistant grounded in authorized municipal knowledge |
| `GET` | `/api/admin/ai/pending` | Admin | AI Operations Centre feed of pending recommendations |
| `POST` | `/api/admin/ai/review/:id` | Admin | Human review (accept, reject, modify) of AI suggestions |

---

### ⚡ 7. n8n Automated Webhooks (`/api/webhooks/n8n`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/webhooks/n8n/suggestions` | Webhook / Secret | Ingest AI classification / duplicate detection suggestion |
| `POST` | `/api/webhooks/n8n/sla-alert` | Webhook / Secret | Ingest SLA overdue / risk warning alert from Workflow C |

---

## Running the Automated Test Suite

Run all 66 unit, integration, and E2E hackathon scenario tests using Node's native test runner:
```bash
npm test
```

### Complete 12-Step Hackathon Demo Scenario Tested:
1. Citizen submits road-damage complaint (`ND-2026-0001`).
2. n8n AI webhook logs classification suggestion (PWD, High priority).
3. Admin accepts suggestion via AI Operations Centre.
4. Second citizen submits nearby duplicate complaint (`ND-2026-0002`).
5. n8n AI webhook flags duplicate complaint.
6. Admin reviews and links reports (`parent_incident_id`).
7. Admin assigns PWD; status advances to `In Progress`.
8. Simulated SLA deadline triggers warning notification.
9. Admin marks resolved with closure notes and evidence.
10. Citizen inspects resolution, disputes closure, and requests reopening.
11. Admin verifies reopening in Verification Queue and sends for re-work.
12. Full audit trail, notifications, and dashboard stats verified with zero discrepancy.

---

## Deployment on Render

This project includes a native `render.yaml` blueprint.

1. Connect this GitHub repository to [Render](https://render.com).
2. Create a new **Blueprint Instance** pointing to `render.yaml`.
3. Fill in the environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`).
4. Render will automatically build and start the service with zero manual configuration.
5. Live health checks are confirmed at `GET /api/health`.
