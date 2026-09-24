# ARCHITECTURE.md — FieldShift System Architecture

> Deep-dive into how FieldShift is structured, how data flows, and how each layer connects.

---

## 🗺️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      CLIENT (Next.js)                    │
│              Farmer Dashboard / Recommendation UI        │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP / REST
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  FieldShift Backend (Express)            │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │   Auth   │  │  Admin   │  │   RAG    │  │  Data  │  │
│  │  Module  │  │  Module  │  │  Module  │  │  APIs  │  │
│  └──────────┘  └──────────┘  └──────────┘  └───┬────┘  │
│                                                  │       │
│         ┌────────────────────────────────────────┤       │
│         ▼             ▼             ▼            ▼       │
│    NASA POWER      IMERG          SMAP       MODIS/VIIRS │
│    (Climate)    (Rainfall)  (Soil Moisture)   (NDVI)     │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                     PostgreSQL (Prisma)                  │
│         Users | Sessions | Document Embeddings           │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Directory Structure

```
server/
├── src/
│   ├── app.ts                    ← Express app config, middleware, routes
│   ├── server.ts                 ← HTTP server entry point
│   │
│   ├── config/
│   │   └── env.ts                ← Typed env variable loader (validates on startup)
│   │
│   ├── middleware/
│   │   ├── checkAuth.ts          ← Auth guard (reads better-auth session)
│   │   ├── validateReq.ts        ← Zod validation middleware
│   │   ├── globalErrorHandeler.ts← Central error handler
│   │   └── notFound.ts           ← 404 handler
│   │
│   └── app/
│       ├── routes/
│       │   └── index.ts          ← Central route registry (/api/v1/*)
│       │
│       ├── shared/
│       │   ├── catchAsync.ts     ← Async error wrapper for controllers
│       │   └── sendResponse.ts   ← Standardized JSON response helper
│       │
│       ├── errorHelpers/
│       │   └── appError.ts       ← Custom AppError class
│       │
│       ├── interfaces/
│       │   └── requestUser.interface.ts  ← Auth user type on req.user
│       │
│       ├── lib/
│       │   ├── auth.ts           ← better-auth configuration
│       │   └── prisma.ts         ← Prisma client singleton
│       │
│       ├── utils/
│       │   └── cookie.ts         ← Cookie helpers
│       │
│       ├── templates/
│       │   └── *.ejs             ← Email templates (EJS)
│       │
│       └── module/
│           ├── Auth/             ← Authentication module
│           ├── admin/            ← Admin CRUD module
│           ├── Rag/              ← RAG/AI knowledge base module
│           └── NasaPower/        ← NASA POWER climate data module ✅
│               ├── nasaPower.interface.ts
│               ├── nasaPower.validation.ts
│               ├── nasaPower.service.ts
│               ├── nasaPower.controller.ts
│               └── nasaPower.route.ts
│
├── prisma/
│   └── Schema/
│       ├── schema.prisma         ← Prisma config + datasource
│       ├── auth.prisma           ← User, Session, Account models
│       ├── enum.prisma           ← Role, userStatus enums
│       └── DocumentEmbedding.prisma ← RAG vector store model
│
├── docs/
│   ├── ARCHITECTURE.md           ← This file
│   └── SCIENTIFIC_METHOD.md      ← NASA data science methodology
│
├── AGENTS.md                     ← AI agent coding instructions
├── CLAUDE.md                     ← Claude-specific instructions
├── README.md                     ← Project overview
└── .env.example                  ← Environment variable template
```

---

## 🔄 Request Lifecycle

Every API request goes through this pipeline:

```
1. Request arrives at Express
        ↓
2. Global Middleware
   - express.json()
   - cors()
   - cookieParser()
        ↓
3. better-auth routes (/api/auth/*)
   OR
   IndexRoute (/api/v1/*)
        ↓
4. Module Router (e.g. NasaPowerRoute)
        ↓
5. validateZodSchema() middleware
   → Validates req.body against Zod schema
   → Throws 422 if invalid
        ↓
6. checkAuth() middleware (if protected)
   → Reads session token from cookie
   → Attaches req.user
        ↓
7. Controller (catchAsync wrapper)
   → Calls Service function
        ↓
8. Service
   → Business logic
   → External API calls (NASA, OpenRouter)
   → Database queries (Prisma)
   → Returns processed data
        ↓
9. Controller calls sendResponse()
   → Sends standardized JSON response
        ↓
10. Response sent to client
```

**On Error:**
```
AppError thrown in Service/Controller
        ↓
catchAsync catches it
        ↓
globalErrorHandler formats it as JSON
        ↓
Client receives { success: false, message: "...", statusCode: 4xx/5xx }
```

---

## 🛰️ NASA Data Pipeline Architecture

```
Client Request
{ latitude, longitude, start, end }
        ↓
NasaPower Service
        │
        ├── Build bounding box (lat±0.5°, lon±0.5°)
        ├── Build query string for NASA POWER API
        │     parameters: T2M, PRECTOTCORR, ALLSKY_SFC_SW_DWN
        │     community: ag (Agroclimatology)
        │     format: json
        │
        ├── fetch() → NASA POWER Regional Daily API
        │     https://power.larc.nasa.gov/api/temporal/daily/regional
        │
        ├── Handle errors (422, 429, 503, 500)
        │
        └── Transform raw response
              { "T2M": { "20250101": 22.5, ... } }
              →
              { temperature: [{ date: "20250101", value: 22.5 }] }
                              ↓
                        Client Response
```

---

## 🗄️ Database Models

### User (auth.prisma)
```
User {
  id, name, email, emailVerified,
  image, role (ADMIN|USER), status,
  isdeleted, deletedAt, createdAt, updatedAt
}
```

### Session (auth.prisma)
```
Session {
  id, expiresAt, ipAddress, userAgent,
  userId → User
}
```

### DocumentEmbedding (DocumentEmbedding.prisma)
```
DocumentEmbedding {
  id, content, embedding (vector),
  metadata (json), source, createdAt
}
```

---

## 🔐 Authentication Flow

```
POST /api/auth/sign-in/email
        ↓
better-auth validates credentials
        ↓
Creates Session in DB
        ↓
Sets httpOnly cookie: better-auth.session_token
        ↓
Protected endpoints read cookie → validate session → attach req.user
```

---

## 📡 API Route Map

```
/api/auth/*              → better-auth (login, register, OAuth, sessions)

/api/v1/
  ├── /admin             → Admin CRUD
  ├── /rag               → RAG knowledge base + AI query
  └── /data
        └── /nasa-power  → NASA POWER climate data ✅
        └── /imerg        → Spatial rainfall (🔜)
        └── /smap         → Soil moisture (🔜)
        └── /modis        → NDVI vegetation (🔜)
```
