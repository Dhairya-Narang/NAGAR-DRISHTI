# Nagar Drishti — Backend API Service

Backend API service for **Nagar Drishti** (Civic Issue Reporting & Resolution Platform), designed for deployment on Render with Supabase PostgreSQL and n8n workflow integration.

## Features

- **Express.js API** with modern ES modules.
- **Render Health Check** ready at `/api/health` and `/health`.
- **Security**: Helmet security headers and configurable CORS.
- **Centralized Error Handling** with structured JSON output.
- **Environment Driven** with `.env.example`.

## Directory Structure

```text
backend/
├── src/
│   ├── config/          # Environment & Database config
│   ├── controllers/     # Route business controllers
│   ├── middleware/      # Auth, role-guards, errors, 404
│   ├── routes/          # API route definitions
│   ├── services/        # Logic & n8n webhook triggers
│   ├── app.js           # Express app setup
│   └── server.js        # Server entrypoint & graceful shutdown
├── .env.example         # Environment template
├── package.json
└── README.md
```

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Update environment variables in .env as needed
```

### 3. Run Locally

* **Development mode (with auto-reload):**
  ```bash
  npm run dev
  ```
* **Production mode:**
  ```bash
  npm start
  ```

## Health Check Endpoint

Used by Render and uptime monitors:
```bash
curl http://localhost:5000/api/health
```

Sample Response:
```json
{
  "status": "healthy",
  "service": "nagar-drishti-backend",
  "version": "1.0.0",
  "timestamp": "2026-10-27T15:30:00.000Z",
  "uptimeSeconds": 42,
  "environment": "development",
  "memory": {
    "rssMB": 35,
    "heapTotalMB": 12,
    "heapUsedMB": 8
  }
}
```

## Render Deployment Settings

- **Environment:** Node
- **Build Command:** `npm install` (or `cd backend && npm install` if deploying from repo root)
- **Start Command:** `npm start` (or `cd backend && npm start`)
- **Health Check Path:** `/api/health`
