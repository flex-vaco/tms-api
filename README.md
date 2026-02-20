# ChronoTrack — Timesheet Management SaaS

A production-grade SaaS timesheet management application for teams.

**Core workflow:** Employees log time → Managers approve timesheets → Admins manage users, projects, and settings.

## Tech Stack

| Layer      | Technology                               |
|------------|------------------------------------------|
| Back-end   | Node.js 20 + Express 4 + TypeScript 5    |
| Front-end  | React 18 (Vite 5) + TypeScript + Tailwind CSS 3 |
| Database   | MySQL 8                                  |
| ORM        | Prisma 5                                 |
| Auth       | JWT (access + refresh token rotation)    |
| Containers | Docker + Docker Compose                  |

## Project Structure

```
/
├── api/                  # Express back-end
│   └── src/
│       ├── controllers/  # Thin request/response handlers
│       ├── services/     # Business logic + Prisma queries
│       ├── middleware/   # auth, rbac, validate, errorHandler, rateLimiter
│       ├── routes/       # Route definitions (dispatch only)
│       ├── prisma/       # schema.prisma + migrations + seed.ts
│       ├── types/        # TypeScript interfaces + error classes
│       └── utils/        # logger, db, tryCatch, dateHelpers, constants
│
├── web/                  # React front-end (Vite)
│   └── src/
│       ├── components/
│       │   └── ui/       # Button, Input, Badge, Toggle, StatCard, Modal, Avatar, Select
│       ├── pages/        # LoginPage, DashboardPage, TimesheetPage, ReportsPage, ApprovalsPage, AdminPage
│       ├── hooks/        # useTimesheets, useProjects, useApprovals, useUsers, useHolidays, useSettings, useReports
│       ├── services/     # Axios api instance + resource service files
│       ├── context/      # AuthContext, ToastContext
│       ├── types/        # TypeScript interfaces
│       └── utils/        # cn, formatHours, dateHelpers
│
├── docker-compose.yml
├── docker-compose.dev.yml
└── CLAUDE.md             # Project specification (source of truth)
```

## Quick Start (Docker — Recommended)

### 1. Clone and configure

```bash
# Copy environment files
cp .env.example .env
cp api/.env.example api/.env
```

Edit `api/.env` and set strong secrets:
```env
JWT_SECRET=your-32-char-minimum-secret-here
JWT_REFRESH_SECRET=another-32-char-minimum-secret
```

### 2. Start all services

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### 3. Run database migration and seed

```bash
# In a new terminal (after services are running)
docker compose exec api npx prisma migrate dev --name init --schema=src/prisma/schema.prisma
docker compose exec api npm run prisma:seed
```

### 4. Open the app

- **Web app:** http://localhost:5173
- **API:** http://localhost:3001/api/v1
- **Health check:** http://localhost:3001/health

### Demo credentials

| Role     | Email                  | Password      |
|----------|------------------------|---------------|
| Admin    | admin@acme.com         | Password123!  |
| Manager  | manager@acme.com       | Password123!  |
| Employee | employee@acme.com      | Password123!  |

---

## Local Development (without Docker)

### Prerequisites

- Node.js 20+
- MySQL 8 running locally

### API setup

```bash
cd api
npm install

# Copy and edit environment
cp .env.example .env
# Set DATABASE_URL to point to your local MySQL

# Generate Prisma client
npx prisma generate --schema=src/prisma/schema.prisma

# Run migrations
npx prisma migrate dev --name init --schema=src/prisma/schema.prisma

# Seed database
npm run prisma:seed

# Start dev server (hot reload via tsx watch)
npm run dev
```

API runs on http://localhost:3001

### Web setup

```bash
cd web
npm install
npm run dev
```

Web runs on http://localhost:5173

---

## API Reference

Base URL: `http://localhost:3001/api/v1`

### Authentication

| Method | Endpoint               | Description                   | Auth     |
|--------|------------------------|-------------------------------|----------|
| POST   | /auth/register         | Create org + admin user        | Public   |
| POST   | /auth/login            | Login, get tokens             | Public   |
| POST   | /auth/refresh          | Refresh access token          | Cookie   |
| POST   | /auth/logout           | Invalidate refresh token      | Bearer   |

### Timesheets

| Method | Endpoint                          | Description                  | Role    |
|--------|-----------------------------------|------------------------------|---------|
| GET    | /timesheets                       | List own timesheets          | All     |
| POST   | /timesheets                       | Create draft                 | All     |
| GET    | /timesheets/:id                   | Get with entries             | All     |
| PUT    | /timesheets/:id                   | Update (draft only)          | All     |
| DELETE | /timesheets/:id                   | Delete (draft only)          | All     |
| POST   | /timesheets/:id/submit            | Submit for approval          | All     |
| POST   | /timesheets/copy-previous-week    | Clone last week's rows       | All     |
| GET    | /timesheets/:id/entries           | List entries                 | All     |
| POST   | /timesheets/:id/entries           | Add entry row                | All     |
| PUT    | /timesheets/:id/entries/:eid      | Update entry                 | All     |
| DELETE | /timesheets/:id/entries/:eid      | Delete entry                 | All     |

### Approvals

| Method | Endpoint              | Description                | Role           |
|--------|-----------------------|----------------------------|----------------|
| GET    | /approvals            | List submitted timesheets  | Manager, Admin |
| GET    | /approvals/stats      | Team stats                 | Manager, Admin |
| POST   | /approvals/:id/approve| Approve timesheet          | Manager, Admin |
| POST   | /approvals/:id/reject | Reject with reason         | Manager, Admin |

### Reports, Projects, Users, Holidays, Settings, Notifications

See `CLAUDE.md` for the full API route table.

---

## Business Rules

1. **One timesheet per user per week** — 409 conflict if duplicate
2. **Immutable after submission** — entries on SUBMITTED/APPROVED timesheets are read-only (403)
3. **Server-side totals** — `totalHours` always recalculated from entries, client values ignored
4. **Self-approval forbidden** — managers cannot approve their own timesheets (403)
5. **Tenant isolation** — every query scoped to `req.user.orgId`
6. **Status machine** — DRAFT → SUBMITTED → APPROVED / REJECTED → SUBMITTED

## RBAC

| Feature                     | EMPLOYEE | MANAGER | ADMIN |
|-----------------------------|----------|---------|-------|
| Own timesheets (CRUD)       | ✅       | ✅      | ✅    |
| Submit own timesheets       | ✅       | ✅      | ✅    |
| View team / approve         | ❌       | ✅      | ✅    |
| Reports                     | ❌       | ✅      | ✅    |
| User management             | ❌       | ❌      | ✅    |
| Project management          | ❌       | ❌      | ✅    |
| Org settings                | ❌       | ❌      | ✅    |

---

## Testing

```bash
# API tests
cd api && npm test

# API coverage (target ≥80%)
cd api && npm run test:coverage

# Web component tests
cd web && npm test
```

---

## Production Build

```bash
docker compose build
docker compose up -d
```

Access via http://localhost (port 80 → nginx serving React SPA + proxy to API).
