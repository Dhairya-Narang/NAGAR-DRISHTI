# 🚀 Nagar Drishti — Production Deployment Guide

This guide walks you through deploying the complete Nagar Drishti civic-tech platform across cloud infrastructure (Backend API, Static Frontend, Supabase PostgreSQL, and n8n AI Workflows).

---

## 🏗 System Architecture & Topology

```mermaid
graph TD
    Citizen[Citizen / Admin Browser] -->|HTTPS| Frontend[Frontend Static Web Portal<br/>Render / Vercel / Netlify]
    Frontend -->|REST API /api| Backend[Backend Express API<br/>Render Web Service]
    Backend -->|SQL Queries & Auth| Supabase[(Supabase PostgreSQL<br/>Cloud Database)]
    Backend <-->|Webhooks & Triggers| n8n[n8n Automation Engine<br/>Cloud / Self-Hosted]
    n8n -->|SMTP Alert / API Call| Email[Municipal Higher Authorities<br/>admin@nagardrishti.gov.in]
```

---

## 🌟 Method 1: Render 1-Click Blueprint (Recommended)

The easiest and fastest method. Render automatically provisions **both** the Node.js Backend API and the Static Frontend using the included [`render.yaml`](render.yaml).

### Step-by-Step Instructions:

1. **Sign in to Render:**
   - Go to [dashboard.render.com](https://dashboard.render.com/) and log in (or sign up with your GitHub account).

2. **Deploy via Blueprint:**
   - In the top right, click **New +** $\rightarrow$ **Blueprint**.
   - Connect your GitHub repository: `Dhairya-Narang/NAGAR-DRISHTI`.
   - Select the `main` branch.
   - Click **Continue**.

3. **Configure Environment Variables:**
   Render will inspect `render.yaml` and prompt you for the following environment variables:
   | Variable | Value / Description | Required? |
   |---|---|---|
   | `SUPABASE_URL` | Your Supabase Project URL (e.g., `https://xyzcompany.supabase.co`) | **Yes** |
   | `SUPABASE_ANON_KEY` | Your Supabase public anonymous key | **Yes** |
   | `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase secret service role key (for backend admin tasks) | **Yes** |
   | `DATABASE_URL` | Supabase connection string (`postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres`) | **Yes** |
   | `N8N_WEBHOOK_BASE_URL` | Your n8n webhook URL (e.g., `https://your-n8n.cloud/webhook/nagar-drishti`) | Optional |
   | `SMTP_HOST` | SMTP server host (e.g., `smtp.gmail.com` or SendGrid) | Optional |
   | `SMTP_PORT` | SMTP port (default `587`) | Optional |
   | `SMTP_USER` | SMTP username / email address | Optional |
   | `SMTP_PASS` | SMTP application password | Optional |
   | `HIGHER_AUTHORITY_EMAIL`| Escalation alert recipient (defaults to `admin@nagardrishti.gov.in`) | Optional |

4. **Click "Apply":**
   - Render will build and deploy both services:
     - `nagar-drishti-backend` $\rightarrow$ `https://nagar-drishti-backend.onrender.com`
     - `nagar-drishti-frontend` $\rightarrow$ `https://nagar-drishti-frontend.onrender.com`
   - Your frontend automatically communicates with the backend via the dynamic resolver in [`frontend/config.js`](frontend/config.js).

---

## ⚡ Method 2: Vercel (Frontend) + Render (Backend)

If you prefer Vercel for maximum edge performance on the frontend:

1. **Deploy Backend on Render (Web Service):**
   - In Render, click **New +** $\rightarrow$ **Web Service**.
   - Connect repo `Dhairya-Narang/NAGAR-DRISHTI`.
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Add environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `JWT_SECRET`, etc.).
   - Note down your backend URL: e.g., `https://nagar-drishti-backend.onrender.com`.

2. **Deploy Frontend on Vercel:**
   - Go to [vercel.com](https://vercel.com) $\rightarrow$ **Add New Project**.
   - Import `Dhairya-Narang/NAGAR-DRISHTI`.
   - Root directory: `./` (leave default).
   - Vercel automatically detects [`vercel.json`](vercel.json) which proxies `/api/*` requests to your Render backend.
   - Click **Deploy**.

---

## 🌐 Method 3: Netlify (Frontend)

1. Connect `Dhairya-Narang/NAGAR-DRISHTI` on [netlify.com](https://netlify.com).
2. Base directory: `./`
3. Publish directory: `frontend`
4. Netlify will use [`netlify.toml`](netlify.toml) to rewrite `/api/*` requests to the production backend.

---

## 🗄️ Setting Up Supabase Database

If you haven't yet seeded your Supabase production database:

1. Open your [Supabase Dashboard](https://supabase.com/dashboard/projects) $\rightarrow$ **SQL Editor**.
2. Run the schema creation script: copy content from [`database/schema.sql`](database/schema.sql) and click **Run**.
3. (Optional) Run the demo seed script: copy content from [`database/seed.sql`](database/seed.sql) and click **Run**.
4. Retrieve your API Keys under **Project Settings $\rightarrow$ API**:
   - Project URL $\rightarrow$ `SUPABASE_URL`
   - `anon public` key $\rightarrow$ `SUPABASE_ANON_KEY`
   - `service_role secret` key $\rightarrow$ `SUPABASE_SERVICE_ROLE_KEY`
5. Retrieve your PostgreSQL connection string under **Project Settings $\rightarrow$ Database $\rightarrow$ Connection URI** $\rightarrow$ `DATABASE_URL`.

---

## 🤖 Importing n8n Automation Workflows

Nagar Drishti comes packaged with ready-to-run n8n workflows located in [`n8n/workflows/`](n8n/workflows/):

1. **Auto-Department Assignment Workflow:**
   - File: [`n8n/workflows/ai_department_auto_assignment.json`](n8n/workflows/ai_department_auto_assignment.json)
   - In your n8n Dashboard: Click **Workflows** $\rightarrow$ **Import from File**.
   - Select this JSON file.
   - In the workflow settings, update the `BACKEND_URL` parameter to your deployed backend (e.g. `https://nagar-drishti-backend.onrender.com`).
   - Toggle **Active** to `ON`.

2. **5-Day SLA Escalation & Authority Email Workflow:**
   - File: [`n8n/workflows/sla_escalation_5days_email_alert.json`](n8n/workflows/sla_escalation_5days_email_alert.json)
   - In your n8n Dashboard: Click **Workflows** $\rightarrow$ **Import from File**.
   - Configure cron trigger (default runs daily at 09:00 AM IST) and set backend webhook target.
   - Toggle **Active** to `ON`.

---

## ✅ Post-Deployment Verification Checklist

Once deployed, verify that the application is operating nominally:

1. **Health Check:**
   Visit `https://<your-backend-url>/api/health`. Should return:
   ```json
   {
     "status": "healthy",
     "timestamp": "...",
     "database": "connected"
   }
   ```

2. **Citizen Registration & Login:**
   - Open frontend URL.
   - Register a citizen account or sign in with demo credentials:
     - **Email:** `priya.sharma@example.com`
     - **Password:** `Citizen@123`

3. **Admin Dashboard Access:**
   - Log out and sign in with demo municipal admin credentials:
     - **Email:** `admin@nagardrishti.gov.in`
     - **Password:** `Admin@123`
   - Verify that Duplicate Hotspots, AI Auto-Assign, and 5-Day SLA Escalations are accessible.
