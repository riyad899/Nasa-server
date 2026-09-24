# CLAUDE.md — Claude AI Instructions for FieldShift

This file tells Claude (and other AI assistants) how to work on this project correctly.

---

## Project: FieldShift — NASA Space App Challenge

FieldShift is an agricultural intelligence platform that pulls satellite and climate data from NASA APIs and combines them with an AI engine to give farmers smart planting recommendations.

---

## Tech Stack

| Layer         | Technology                              |
|---------------|-----------------------------------------|
| Runtime       | Node.js 22+ (ESM)                       |
| Language      | TypeScript 5.x (strict)                 |
| Framework     | Express 5.x                             |
| ORM           | Prisma 7 + PostgreSQL                   |
| Auth          | better-auth 1.x (session + Google OAuth)|
| Validation    | Zod 4.x                                 |
| AI/RAG        | OpenRouter API                          |
| Email         | Nodemailer + SMTP                       |
| Dev Server    | tsx watch                               |

---

## Critical Rules

### 1. Module Pattern — Always Follow This

Every new feature MUST follow the 5-file module pattern:

```
featureName.interface.ts   → TypeScript types
featureName.validation.ts  → Zod schema
featureName.service.ts     → Logic + external API calls
featureName.controller.ts  → catchAsync + sendResponse wrappers
featureName.route.ts       → Router registration
```

After creating, **always** register in `src/app/routes/index.ts`.

### 2. Imports — Use `.js` extension always

```typescript
// ✅ Correct
import { AppError } from "../../errorHelpers/appError.js";

// ❌ Wrong
import { AppError } from "../../errorHelpers/appError";
```

### 3. Response — Always use sendResponse

```typescript
import { sendResponse } from "../../shared/sendResponse.js";
import status from "http-status";

sendResponse(res, {
    httpStatus: status.OK,
    success: true,
    message: "Data fetched successfully",
    data: result,
});
```

### 4. Errors — Always use AppError

```typescript
import AppError from "../../errorHelpers/appError.js";
import status from "http-status";

throw new AppError("Resource not found", status.NOT_FOUND);
```

### 5. Controllers — Always use catchAsync

```typescript
import catchAsync from "../../shared/catchAsync.js";

const myHandler = catchAsync(async (req: Request, res: Response) => {
    // ...
});
```

### 6. Env Variables — Always use envVars, never process.env directly

```typescript
import { envVars } from "../../config/env.js";

const port = envVars.PORT; // ✅
const port = process.env.PORT; // ❌
```

### 7. External API Calls — Only in service layer

Never call external APIs (NASA, OpenRouter, etc.) from controllers. Always put them in the service file.

---

## Planned NASA Data Pipeline

```
FieldShift
    │
    ├── NASA POWER API     → Temperature, Rainfall, Solar Radiation
    ├── NASA IMERG         → Spatial Rainfall (coming soon)
    ├── NASA SMAP          → Soil Moisture (coming soon)
    ├── NASA MODIS/VIIRS   → NDVI Vegetation Index (coming soon)
    └── AI/Rules Engine    → Planting Recommendations (coming soon)
```

All data modules live under: `src/app/module/`
All data APIs are registered under: `GET /api/v1/data/*`

---

## Current Module Status

- ✅ `Auth` — Login, Register, Google OAuth, Sessions
- ✅ `Admin` — Admin CRUD operations
- ✅ `Rag` — RAG knowledge base (ingest + query)
- ✅ `NasaPower` — NASA POWER climate data fetcher
- 🔜 `IMERG` — Spatial rainfall data
- 🔜 `SMAP` — Soil moisture data
- 🔜 `MODIS` — NDVI vegetation data
- 🔜 `AIEngine` — Planting recommendation engine
