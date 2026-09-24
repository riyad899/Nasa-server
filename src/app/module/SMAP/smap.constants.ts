export const SMAP_CONSTANTS = {
  SOURCE: "NASA SMAP",
  DATASET: "SPL4SMGP",
  VERSION: "008",
  COLLECTION_CONCEPT_ID: "C3480440870-NSIDC_CPRD",
  HARMONY_BASE_URL: "https://harmony.earthdata.nasa.gov",
  CMR_BASE_URL: "https://cmr.earthdata.nasa.gov",
  RESOLUTION: "9 km",
  TEMPORAL_RESOLUTION: "3-hourly",
  FILL_VALUE: -9999.0,
  VARIABLES: {
    SURFACE: "Geophysical_Data/sm_surface",
    ROOTZONE: "Geophysical_Data/sm_rootzone",
  },
  THRESHOLDS: {
    SURFACE: {
      DRY_STRESS: 0.15,
      OPTIMAL_MAX: 0.35,
    },
    ROOTZONE: {
      DEPLETED_STRESS: 0.18,
      ADEQUATE_MAX: 0.32,
    },
  },
} as const;

export enum SoilMoistureSurfaceCondition {
  DRY_STRESS = "DRY_STRESS",
  OPTIMAL_MOISTURE = "OPTIMAL_MOISTURE",
  WATERLOGGED = "WATERLOGGED",
}

export enum SoilMoistureRootzoneCondition {
  DEPLETED_RESERVE = "DEPLETED_RESERVE",
  ADEQUATE_RESERVE = "ADEQUATE_RESERVE",
  SATURATED = "SATURATED",
}
