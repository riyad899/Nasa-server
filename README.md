# FieldShift 🌾🛰️

> **NASA Space App Challenge 2025**
> An AI-powered agricultural intelligence platform using NASA satellite data to generate smart crop planting recommendations.

> **Client site code:** https://github.com/riyad899/Nasa-Clint

---

## 🚀 What is FieldShift?

FieldShift combines multiple NASA satellite datasets with an AI engine to help farmers make data-driven decisions about **when and what to plant**.

By analyzing real climate data — temperature, rainfall, solar radiation, soil moisture, and vegetation health — FieldShift can detect climate patterns and recommend optimal planting windows for crops in any region.

---

## 🌍 Data Sources

| Source | Data | API |
|---|---|---|
| **NASA POWER** | Temperature (T2M), Rainfall (PRECTOTCORR), Solar Radiation (ALLSKY_SFC_SW_DWN) | `power.larc.nasa.gov` |
| **NASA IMERG** | High-resolution spatial rainfall | GES DISC |
| **NASA SMAP** | Soil moisture & field conditions | SMAP L4 |
| **NASA MODIS/VIIRS** | NDVI — vegetation health index | NASA Earthdata |

---

## 🧠 System Architecture

```
FieldShift
    │
    ├── Climate Analysis
    │        │
    │   ┌────┼─────────────────┐
    │   ↓    ↓                 ↓
    │ NASA POWER   IMERG      SMAP
    │   │          │           │
    │ Temp       Rainfall   Soil Moisture
    │ Rainfall   Spatial    Field Condition
    │ Solar
    │   └────┬─────────────────┘
    │        ↓
    │   MODIS / VIIRS
    │        │
    │       NDVI
    │        ↓
    │   ┌──────────────┐
    │   │ AI / Rules   │
    │   │   Engine     │
    │   └──────┬───────┘
    │          ↓
    │   Planting Recommendation
```

---

## 🛠️ Tech Stack

**Backend (this repo)**
- Node.js 22 + TypeScript 5 (ESM)
- Express 5
- Prisma 7 + PostgreSQL
- better-auth (Session + Google OAuth)
- Zod validation
- OpenRouter AI (RAG / LLM)

---

## 📦 Installation

```bash
# Clone the repository
git clone <repo-url>
cd server

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in your values in .env

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

---

## 🔑 Environment Variables

Copy `.env.example` to `.env` and fill in the values. See [.env.example](./.env.example) for all required variables.

---

## 📡 API Reference

### Base URL
```
http://localhost:5000/api/v1
```

### NASA Data Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` / `POST` | `/data/nasa-power` | Fetch single-point climate data from NASA POWER |
| `GET` / `POST` | `/data/nasa-power/regional` | Fetch bounding box / regional climate data from NASA POWER |
| `POST` | `/data/nasa-power/regional/historical/fetch` | Fetch up to 2+ years of regional NASA POWER data with automatic 366-day chunking & DB storage |
| `GET` | `/data/nasa-power/regional/historical` | Fast DB-powered climate queries (`mode`: `summary`, `daily`, `monthly`, `seasonal`, `full`) |
| `GET` | `/data/nasa-power/regional/historical/status` | Check if historical climate dataset exists and is complete in DB |
| `POST` | `/data/nasa-power/regional/historical/refresh` | Force re-fetch from NASA POWER and upsert historical records |
| `GET` / `POST` | `/data/imerg` | Spatial rainfall from NASA IMERG Final Daily |
| `POST` | `/data/imerg/historical/fetch` | Fetch up to 2 years of IMERG rainfall data with automatic $\le 60$-day chunking & DB storage |
| `GET` | `/data/imerg/historical` | Fast DB-powered IMERG queries with `latitude` & `longitude` or `district` (max 2 years) |
| `GET` | `/data/imerg/historical/status` | Check if IMERG historical dataset exists and review date coverage |
| `POST` | `/data/imerg/historical/refresh` | Force re-fetch from NASA GES DISC and update stored IMERG records |
| `GET` / `POST` | `/data/smap` | Surface & root-zone soil moisture from NASA SMAP L4 |
| `POST` | `/data/smap/historical/fetch` | Fetch up to 2 years of SMAP soil moisture data with automatic $\le 30$-day chunking & DB storage |
| `GET` | `/data/smap/historical` | Fast DB-powered SMAP queries with `latitude` & `longitude` or `district` (max 2 years) |
| `GET` | `/data/smap/historical/status` | Check if SMAP historical dataset exists and review date coverage |
| `POST` | `/data/smap/historical/refresh` | Force re-fetch from NASA Earthdata and update stored SMAP records |
| `GET` / `POST` | `/data/modis` | NDVI vegetation (🔜 coming soon) |

### NASA POWER — Example

**Request:**
```http
GET /api/v1/data/nasa-power
Content-Type: application/json

{
  "latitude": 24.3745,
  "longitude": 88.6042,
  "start": "20250101",
  "end": "20251231"
}
```

**Response:**
```json
{
  "success": true,
  "message": "NASA POWER data fetched successfully",
  "data": {
    "source": "NASA_POWER",
    "location": {
      "latitude": 24.3745,
      "longitude": 88.6042,
      "boundingBox": { "latMin": 23.8745, "latMax": 24.8745, "lonMin": 88.1042, "lonMax": 89.1042 }
    },
    "period": { "start": "20250101", "end": "20251231" },
    "data": {
      "temperature": [{ "date": "20250101", "value": 18.5 }],
      "rainfall": [{ "date": "20250101", "value": 0.0 }],
      "solarRadiation": [{ "date": "20250101", "value": 14.2 }]
    }
  }
}
```

### NASA POWER — Multi-Year Historical System & Fast Database Query

FieldShift includes an automated multi-year regional historical data ingestion and fast database query engine:
- **Automatic Date Chunking:** Automatically divides 2+ year requests into compliant chunks $\le 366$ days (respecting NASA POWER limits).
- **Graceful Concurrency & Retry:** Batched parallel fetching with exponential backoff.
- **Auto-Expanded Solar Bounding Box:** NASA requires $\ge 2.0^\circ$ span for `ALLSKY_SFC_SW_DWN`; the system automatically expands and locally filters points for district-level queries.
- **Database Idempotency:** Stores records in PostgreSQL via Prisma (`NasaPowerRegionalDataset` and `NasaPowerDailyRecord`) with unique constraints.
- **Aggregation Modes:** Fast sub-second DB queries supporting `summary`, `daily`, `monthly`, `seasonal`, or `full` mode.

#### 1. Fetch & Store Multi-Year Regional Data
**Request:**
```http
POST /api/v1/data/nasa-power/regional/historical/fetch
Content-Type: application/json

{
  "district": "Rajshahi",
  "start": "20230101",
  "end": "20241231",
  "forceRefresh": false
}
```

#### 2. Query Fast DB Climate Data (Crop Rotation & Recommendations)
**Request:**
```http
GET /api/v1/data/nasa-power/regional/historical?district=Rajshahi&start=20230101&end=20241231&mode=full
```

**Response:**
```json
{
  "success": true,
  "message": "Historical climate data retrieved from database",
  "data": {
    "source": "DATABASE",
    "regionKey": "bbox:24.00:24.75:88.20:89.00",
    "district": "Rajshahi",
    "period": { "start": "20230101", "end": "20241231", "days": 731 },
    "summary": {
      "averageTemperature": 25.4,
      "minimumTemperature": 10.2,
      "maximumTemperature": 41.5,
      "totalRainfall": 1420.5,
      "averageDailyRainfall": 1.94,
      "rainyDays": 84,
      "dryDays": 647,
      "averageSolarRadiation": 17.8
    },
    "coverage": { "requestedDays": 731, "availableDays": 731, "missingDays": 0, "coveragePercentage": 100 },
    "daily": [...],
    "monthly": [...],
    "seasonal": [
      {
        "season": "Winter (Dec-Feb)",
        "year": 2024,
        "temperatureMean": 18.2,
        "totalRainfall": 12.0,
        "rainyDays": 2,
        "dryDays": 89,
        "maxConsecutiveDryDays": 45,
        "solarRadiationMean": 14.1,
        "daysCount": 91
      }
    ]
  }
}
```

### NASA SMAP (Soil Moisture) — Example

**Request:**
```http
POST /api/v1/data/smap
Content-Type: application/json

{
  "Bottom-Left Lat": 20.34,
  "Bottom-Left Lon": 88.01,
  "Upper-Right Lat": 26.63,
  "Upper-Right Lon": 92.68,
  "start": "20240101",
  "end": "20240102"
}
```

**Response:**
```json
{
  "success": true,
  "message": "SMAP soil moisture data fetched successfully",
  "data": {
    "source": "NASA SMAP",
    "dataset": "SPL4SMGP",
    "version": "008",
    "unit": "m³/m³",
    "sourceVariable": {
      "surface": "Geophysical_Data/sm_surface",
      "rootzone": "Geophysical_Data/sm_rootzone"
    },
    "resolution": "9 km",
    "temporalResolution": "3-hourly",
    "aggregationMethod": {
      "spatial": "Spatial arithmetic mean across all valid 9 km EASE-Grid 2.0 cells within the bounding box",
      "temporal": "Representative daytime 3-hourly assimilation cycle (01:30 / 13:30 UTC)",
      "dailyDerivationExplanation": "NASA SMAP Level-4 (SPL4SMGP) is a model-assimilated 3-hourly product. Daily representative values are generated by sampling the primary assimilation time steps for each UTC calendar day and calculating the spatial arithmetic mean over all valid grid cells, strictly excluding missing fill values (-9999.0)."
    },
    "qualityFilter": "Excludes fill values (-9999.0) and unphysical negative values. Only grid cells with valid geophysical model assimilation retrievals (0.0 to 1.0 m³/m³) are included.",
    "conditionMethod": {
      "rule": "Agro-hydrological thresholds for volumetric soil moisture (m³/m³)",
      "surface": {
        "DRY_STRESS": "< 0.15 m³/m³ (Severe moisture deficit for germination and shallow roots)",
        "OPTIMAL_MOISTURE": "0.15 - 0.35 m³/m³ (Optimal topsoil condition for agricultural crop growth)",
        "WATERLOGGED": "> 0.35 m³/m³ (Excess topsoil saturation / waterlogging risk)"
      },
      "rootzone": {
        "DEPLETED_RESERVE": "< 0.18 m³/m³ (Sub-surface moisture depletion, plant wilting risk)",
        "ADEQUATE_RESERVE": "0.18 - 0.32 m³/m³ (Adequate sub-surface water reserve for vegetative growth)",
        "SATURATED": "> 0.32 m³/m³ (Sub-surface saturation / high percolation)"
      }
    },
    "timestamp": {
      "generatedAt": "2026-10-29T16:00:26.886Z",
      "timezone": "UTC (NASA Earthdata standard; +06:00 for Bangladesh Standard Time BST)"
    },
    "bbox": {
      "latMin": 20.34,
      "latMax": 26.63,
      "lonMin": 88.01,
      "lonMax": 92.68
    },
    "period": { "start": "2024-01-01", "end": "2024-01-02", "days": 2 },
    "statistics": {
      "surface": { "mean": 0.2143, "min": 0.0667, "max": 0.4529, "condition": "OPTIMAL_MOISTURE" },
      "rootzone": { "mean": 0.2804, "min": 0.0931, "max": 0.8183, "condition": "ADEQUATE_RESERVE" }
    },
    "data": [
      {
        "date": "2024-01-01",
        "timestamp": "2024-01-01T00:00:00Z",
        "surfaceSoilMoisture": 0.2208,
        "rootZoneSoilMoisture": 0.2815,
        "unit": "m³/m³",
        "validCells": 3357
      }
    ]
  }
}
```

### Auth Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/sign-in/email` | Login with email/password |
| `POST` | `/api/auth/sign-up/email` | Register |
| `GET` | `/api/auth/sign-in/google` | Google OAuth |

### Open NASA 2-Year Historical Data APIs (No Auth Needed)

All historical climate, precipitation, and soil moisture endpoints are **100% open** — no bearer tokens, no cookies, and no NASA Earthdata login credentials required.

#### 1. SMAP (Soil Moisture) Historical API
- **Fetch & Save 2 Years:** `POST /api/v1/data/smap/historical/fetch`
  ```bash
  curl -X POST "http://localhost:5007/api/v1/data/smap/historical/fetch" \
    -H "Content-Type: application/json" \
    -d '{"district": "Rajshahi", "start": "20230101", "end": "20241231"}'
  ```
- **Direct Database Query:** `GET /api/v1/data/smap/historical`
  ```bash
  # Query with single lat/lon point (auto-buffered):
  curl "http://localhost:5007/api/v1/data/smap/historical?latitude=24.37&longitude=88.6&start=20230101&end=20241231&format=summary"

  # Query with district name:
  curl "http://localhost:5007/api/v1/data/smap/historical?district=Rajshahi&start=20230101&end=20241231"
  ```
- **Dataset Status:** `GET /api/v1/data/smap/historical/status?district=Rajshahi`
- **Refresh Data:** `POST /api/v1/data/smap/historical/refresh`

#### 2. IMERG (Rainfall / Precipitation) Historical API
- **Fetch & Save 2 Years:** `POST /api/v1/data/imerg/historical/fetch`
  ```bash
  curl -X POST "http://localhost:5007/api/v1/data/imerg/historical/fetch" \
    -H "Content-Type: application/json" \
    -d '{"district": "Rajshahi", "start": "20230101", "end": "20241231"}'
  ```
- **Direct Database Query:** `GET /api/v1/data/imerg/historical`
  ```bash
  curl "http://localhost:5007/api/v1/data/imerg/historical?latitude=24.37&longitude=88.6&start=20230101&end=20241231&format=summary"
  ```
- **Dataset Status:** `GET /api/v1/data/imerg/historical/status?district=Rajshahi`
- **Refresh Data:** `POST /api/v1/data/imerg/historical/refresh`

#### 3. NASA POWER (Solar, Temperature, Humidity) Historical API
- **Fetch & Save 2 Years:** `POST /api/v1/data/nasa-power/regional/historical/fetch`
- **Direct Database Query:** `GET /api/v1/data/nasa-power/regional/historical`
- **Dataset Status:** `GET /api/v1/data/nasa-power/regional/historical/status`
- **Refresh Data:** `POST /api/v1/data/nasa-power/regional/historical/refresh`

### RAG / AI Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/rag/ingest` | Ingest knowledge base |
| `POST` | `/api/v1/rag/query` | Ask the AI assistant |
| `GET` | `/api/v1/rag/stats` | Vector store statistics |

---

## 🗂️ Project Structure

```
server/
├── src/
│   ├── app/
│   │   ├── module/
│   │   │   ├── Auth/          ← Authentication
│   │   │   ├── admin/         ← Admin management
│   │   │   ├── Rag/           ← AI/RAG engine
│   │   │   └── NasaPower/     ← NASA POWER API ✅
│   │   ├── routes/index.ts    ← Route registry
│   │   ├── shared/            ← catchAsync, sendResponse
│   │   ├── errorHelpers/      ← AppError
│   │   ├── lib/               ← Prisma, Auth setup
│   │   └── templates/         ← Email templates
│   ├── config/env.ts          ← Typed env loader
│   ├── middleware/            ← Auth, validation, error handling
│   ├── app.ts
│   └── server.ts
├── prisma/
│   └── Schema/
│       ├── schema.prisma
│       ├── auth.prisma
│       └── DocumentEmbedding.prisma
├── AGENTS.md                  ← AI agent instructions
├── CLAUDE.md                  ← Claude-specific instructions
├── docs/
│   ├── ARCHITECTURE.md        ← System architecture deep-dive
│   └── SCIENTIFIC_METHOD.md   ← NASA data science methodology
└── .env.example
```

---

## 📊 Development Status

| Feature | Status |
|---|---|
| Auth (email + Google OAuth) | ✅ Complete |
| Admin module | ✅ Complete |
| RAG / AI Assistant | ✅ Complete |
| NASA POWER data API | ✅ Complete |
| NASA IMERG rainfall API | ✅ Complete |
| NASA SMAP soil moisture API | ✅ Complete |
| NASA MODIS NDVI API | 🔜 Planned |
| AI Planting Recommendation Engine | 🔜 Planned |

---

## 🏆 NASA Space App Challenge 2025

This project is submitted for the **NASA Space App Challenge 2025**.

> *"Using the power of open NASA data to help farmers grow smarter."*
