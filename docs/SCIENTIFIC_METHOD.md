# SCIENTIFIC_METHOD.md — Scientific Methodology & NASA Earth Science Data Integration

> **FieldShift — NASA Space Apps Challenge**
> Scientific background, sensor physical principles, validation methodologies, and agronomic threshold derivation.

---

## 🌍 1. Overview

FieldShift bridges NASA's Earth Observation System (EOS) with agricultural decision-making by harmonizing:
1. **Atmospheric & Solar Dynamics**: NASA POWER (MERRA-2 assimilation + GEOS-5)
2. **Precipitation Regimes**: NASA GPM IMERG Final Daily (`GPM_3IMERGDF_07`)
3. **Hydrological & Soil State**: NASA SMAP Level-4 Global Soil Moisture (`SPL4SMGP_008`)
4. **Biospheric Canopy Health**: NASA MODIS/VIIRS NDVI

```
                             FieldShift Architecture
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
      NASA POWER                 NASA GPM IMERG             NASA SMAP L4
    (MERRA-2 Assimilation)     (Dual-Freq Radar & Radiometer)  (L-band 1.41 GHz & Catchment Model)
            │                          │                          │
   • Temperature (T2M)         • Spatial Rainfall (mm/day) • Surface Soil Moisture (0-5cm)
   • Solar Irradiance (SW)     • Extreme Wet Day Detection • Root-Zone Soil Moisture (0-100cm)
   • Relative Humidity         • Spatial Drought / Flood   • Waterlogging & Stress Index
            │                          │                          │
            └──────────────────────────┼──────────────────────────┘
                                       ▼
                             MODIS/VIIRS Canopy NDVI
                                       │
                                       ▼
                       AI & Agronomic Recommendation Engine
```

---

## 🛰️ 2. NASA SMAP (Soil Moisture Active Passive)

### 2.1 Dataset & Sensor Specs
- **Product**: `SPL4SMGP` Version `008` (SMAP L4 Global 3-hourly 9 km EASE-Grid Surface and Root Zone Soil Moisture Geophysical Data).
- **Physical Sensor**: L-Band (1.41 GHz) Radiometer coupled with NASA GMAO Catchment Land Surface Model (Ensemble Kalman Filter assimilation).
- **Grid Geometry**: Cylindrical 9 km Equal-Area Scalable Earth Grid 2.0 (EASE-Grid 2.0, EPSG:6933).

### 2.2 Variables & Geophysical Units
- **Surface Soil Moisture (`sm_surface`)**: Top layer ($0\text{--}5\text{ cm}$), volumetric water content ($\theta$, $m^3/m^3$).
- **Root-Zone Soil Moisture (`sm_rootzone`)**: Crop root zone ($0\text{--}100\text{ cm}$), volumetric water content ($\theta$, $m^3/m^3$).
- **Valid Range**: $0.0 \le \theta \le 0.9\text{ }m^3/m^3$. Fill value: $-9999.0$.

### 2.3 Agronomic Classification Model
| Parameter | Threshold ($m^3/m^3$) | Agronomic State | Actionable Farm Implication |
|---|---|---|---|
| **Surface Moisture** | $< 0.15$ | `DRY_STRESS` | Poor seedbed moisture; germination failure risk. Irrigation recommended before sowing. |
| **Surface Moisture** | $0.15 \le \theta \le 0.35$ | `OPTIMAL_MOISTURE` | Ideal moisture for seed germination, seed emergence, and soil aeration. |
| **Surface Moisture** | $> 0.35$ | `WATERLOGGED` | Saturation; anaerobic soil conditions, crusting risk, seed rot danger. |
| **Rootzone Moisture** | $< 0.18$ | `DEPLETED_RESERVE` | Root water deficit; plant stomatal closure, wilting stress. |
| **Rootzone Moisture** | $0.18 \le \theta \le 0.32$ | `ADEQUATE_RESERVE` | Optimal vegetative growth and nutrient transport. |
| **Rootzone Moisture** | $> 0.32$ | `SATURATED` | Elevated water table; prolonged saturation may lead to root asphyxiation. |

---

## 🌧️ 3. NASA GPM IMERG (Integrated Multi-satellitE Retrievals for GPM)

### 3.1 Dataset & Calibration
- **Product**: `GPM_3IMERGDF` Version `07` (Final Run Daily $0.1^\circ \times 0.1^\circ$).
- **Instruments**: Dual-frequency Precipitation Radar (DPR), GPM Microwave Imager (GMI), merged with international passive microwave and geo-IR constellation, gauge-calibrated with GPCC ground networks.

### 3.2 Key Indicators & Metrics
- **Daily Precipitation (`precipitation`)**: $mm/\text{day}$.
- **Rainy Day Threshold**: $\ge 1.0\text{ }mm/\text{day}$ (standard WMO/FAO definition).
- **Extreme Precipitation Day**: $\ge 64.5\text{ }mm/\text{day}$ (WMO heavy rainfall / flood risk trigger).
- **Maximum Consecutive Dry Days (CDD)**: Identifies prolonged meteorological dry spells.

---

## ☀️ 4. NASA POWER (Prediction of Worldwide Energy Resources)

### 4.1 Atmospheric & Solar Fluxes
- **Model**: GEOS-5 / MERRA-2 Agroclimatology (`community: ag`).
- **Temperature (`T2M`)**: 2-meter air temperature ($^\circ\text{C}$).
- **Solar Irradiance (`ALLSKY_SFC_SW_DWN`)**: All-sky downward shortwave radiative flux ($MJ/m^2/\text{day}$ or $kW\cdot h/m^2/\text{day}$).
- **Growing Degree Days (GDD)**: Crop thermal accumulation calculations:
  $$GDD = \max\left(0, \frac{T_{\max} + T_{\min}}{2} - T_{\text{base}}\right)$$

---

## 🔬 5. Data Fusion & AI Reasoning Flow

FieldShift blends these satellite datasets into a cohesive crop advisement vector:
1. **Soil-Plant-Atmosphere Continuum (SPAC)**: Correlates rainfall events (IMERG) with soil retention rates (SMAP) and evapotranspiration demands (NASA POWER solar radiation + temperature).
2. **Planting Feasibility Window**:
   - Seedbed moisture is in `OPTIMAL_MOISTURE` ($0.15 \le \theta_{\text{surf}} \le 0.35$).
   - Rootzone moisture is in `ADEQUATE_RESERVE` ($0.18 \le \theta_{\text{root}} \le 0.32$).
   - Forecasted 7-day cumulative rainfall indicates favorable seedling establishment without flood hazard.
   - Temperature stays within crop-specific thermal tolerance bands ($T_{\text{base}} \le T \le T_{\text{opt}}$).
