# FieldShift 🌾🛰️

> **NASA Space App Challenge 2025**
> An AI-powered agricultural intelligence platform using NASA satellite data to generate smart crop planting recommendations.

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
| `GET` | `/data/nasa-power` | Fetch climate data from NASA POWER |
| `GET` | `/data/imerg` | Spatial rainfall (🔜 coming soon) |
| `GET` | `/data/smap` | Soil moisture (🔜 coming soon) |
| `GET` | `/data/modis` | NDVI vegetation (🔜 coming soon) |

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

### Auth Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/sign-in/email` | Login with email/password |
| `POST` | `/api/auth/sign-up/email` | Register |
| `GET` | `/api/auth/sign-in/google` | Google OAuth |

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
| NASA IMERG rainfall API | 🔜 Planned |
| NASA SMAP soil moisture API | 🔜 Planned |
| NASA MODIS NDVI API | 🔜 Planned |
| AI Planting Recommendation Engine | 🔜 Planned |

---

## 🏆 NASA Space App Challenge 2025

This project is submitted for the **NASA Space App Challenge 2025**.

> *"Using the power of open NASA data to help farmers grow smarter."*
