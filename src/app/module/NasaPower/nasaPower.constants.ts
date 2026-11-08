export const NASA_POWER_CONSTANTS = {
  SOURCE: "NASA_POWER",
  REGIONAL_SOURCE: "NASA_POWER_REGIONAL",
  BASE_URL: "https://power.larc.nasa.gov/api/temporal/daily/point",
  REGIONAL_BASE_URL: "https://power.larc.nasa.gov/api/temporal/daily/regional",
  COMMUNITY: "ag",
  FILL_VALUE: -999,
  PARAMETERS: ["T2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN"] as const,
  // NASA POWER regional API hard constraint: max 366 days per request
  MAX_CHUNK_DAYS: 366,
  MAX_CONCURRENCY: 3,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1500,
  DEFAULT_BANGLADESH_BBOX: {
    latitudeMin: 20.34,
    latitudeMax: 26.63,
    longitudeMin: 88.01,
    longitudeMax: 92.68,
  },
} as const;

export type { IDistrictCoordinate } from "../../shared/geo.constants.js";
export {
  BANGLADESH_DISTRICTS,
  buildRegionKey,
  resolveDistrictCoordinates,
} from "../../shared/geo.constants.js";


