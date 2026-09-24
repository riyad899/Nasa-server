# AGENTS.md — AI Agent Instructions for FieldShift Server

This file provides context and coding rules for any AI agent (Antigravity, Claude, Copilot, etc.) working on this codebase.

---

## 🌍 Project Overview

**FieldShift** is a NASA Space App Challenge project. It is an agricultural climate analysis platform that fetches satellite and climate data from multiple NASA APIs and uses an AI/Rules Engine to generate smart planting recommendations for farmers.

---

## 🏗️ Project Type

- **Backend**: Node.js + Express + TypeScript (ESM modules)
- **ORM**: Prisma with PostgreSQL
- **Auth**: better-auth (session-based + Google OAuth)
- **Validation**: Zod
- **AI/RAG**: OpenRouter API (LLM + Embeddings)
- **Runtime**: tsx (dev), Node.js (prod)

---

## 📁 Folder Structure Rules

```
src/
├── app/
│   ├── module/              ← Feature modules go here
│   │   ├── Auth/
│   │   ├── admin/
│   │   ├── Rag/
│   │   └── NasaPower/       ← NASA POWER climate data module
│   ├── routes/index.ts      ← Central route registry
│   ├── shared/              ← catchAsync, sendResponse
│   ├── errorHelpers/        ← AppError class
│   ├── interfaces/          ← Shared interfaces
│   ├── lib/                 ← auth.ts, prisma.ts
│   ├── utils/               ← Utilities (cookie, etc.)
│   └── templates/           ← EJS email templates
├── config/env.ts            ← Typed env loader
├── middleware/              ← checkAuth, validateReq, globalErrorHandler
├── app.ts                   ← Express app setup
└── server.ts                ← HTTP server entry point
```

---

## 📐 Module Structure Convention

Every feature module MUST follow this pattern:

```
module/FeatureName/
├── featureName.interface.ts   ← TypeScript interfaces
├── featureName.validation.ts  ← Zod schema
├── featureName.service.ts     ← Business logic / external API calls
├── featureName.controller.ts  ← Express handlers (catchAsync + sendResponse)
└── featureName.route.ts       ← Express Router
```

Then register the route in `src/app/routes/index.ts`.

---

## ✅ Coding Rules

1. **Always use `catchAsync`** from `../../shared/catchAsync.js` to wrap controller functions.
2. **Always use `sendResponse`** from `../../shared/sendResponse.js` for all HTTP responses.
3. **Always use `AppError`** from `../../errorHelpers/appError.js` for throwing domain errors.
4. **Validate all incoming request bodies** using `validateZodSchema` middleware with a Zod schema.
5. **Never use `any` type** — always define proper TypeScript interfaces.
6. **Use `.js` extensions** in all import paths (ESM requirement).
7. **External API calls** belong in the service layer only — never in controllers.
8. **Environment variables** must be accessed via `envVars` from `src/config/env.ts`, never via `process.env` directly.
9. **Error handling**: Use `http-status` constants (e.g., `status.NOT_FOUND`) — never hardcode status codes.

---

## 🛰️ NASA Data Modules (Planned)

| Module        | Source         | Data                          | Status      |
|---------------|----------------|-------------------------------|-------------|
| NasaPower     | NASA POWER API | Temperature, Rainfall, Solar  | ✅ Done     |
| IMERG         | NASA IMERG     | Spatial Rainfall              | 🔜 Planned  |
| SMAP          | NASA SMAP      | Soil Moisture                 | 🔜 Planned  |
| MODIS/VIIRS   | NASA MODIS     | NDVI (Vegetation Index)       | 🔜 Planned  |
| AI Engine     | Internal       | Planting Recommendations      | 🔜 Planned  |

---

## 🚦 API Conventions

- Base URL: `GET /api/v1/`
- Auth routes: `/api/auth/*` (handled by better-auth)
- Data routes: `/api/v1/data/*`
- Admin routes: `/api/v1/admin/*`
- RAG routes: `/api/v1/rag/*`

---

## 🔐 Auth

- Uses `better-auth` with session tokens + Google OAuth
- Middleware: `checkAuth(Role.USER)` or `checkAuth(Role.ADMIN)`
- Public routes (no auth needed): NASA data endpoints, RAG query
