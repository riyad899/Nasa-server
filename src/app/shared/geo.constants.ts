export const DEFAULT_BANGLADESH_BBOX = {
  latitudeMin: 20.34,
  latitudeMax: 26.63,
  longitudeMin: 88.01,
  longitudeMax: 92.68,
} as const;

export interface IDistrictCoordinate {
  name: string;
  latitude: number;
  longitude: number;
  bbox: {
    latitudeMin: number;
    latitudeMax: number;
    longitudeMin: number;
    longitudeMax: number;
  };
}

export const BANGLADESH_DISTRICTS: Record<string, IDistrictCoordinate> = {
  Mymensingh: {
    name: "Mymensingh",
    latitude: 24.75,
    longitude: 90.4,
    bbox: { latitudeMin: 24.4, latitudeMax: 25.1, longitudeMin: 90.0, longitudeMax: 90.8 },
  },
  Rajshahi: {
    name: "Rajshahi",
    latitude: 24.37,
    longitude: 88.6,
    bbox: { latitudeMin: 24.0, latitudeMax: 24.75, longitudeMin: 88.2, longitudeMax: 89.0 },
  },
  Rangpur: {
    name: "Rangpur",
    latitude: 25.75,
    longitude: 89.25,
    bbox: { latitudeMin: 25.35, latitudeMax: 26.15, longitudeMin: 88.85, longitudeMax: 89.65 },
  },
  Dhaka: {
    name: "Dhaka",
    latitude: 23.81,
    longitude: 90.41,
    bbox: { latitudeMin: 23.45, latitudeMax: 24.15, longitudeMin: 90.05, longitudeMax: 90.75 },
  },
  Chittagong: {
    name: "Chittagong",
    latitude: 22.36,
    longitude: 91.78,
    bbox: { latitudeMin: 21.95, latitudeMax: 22.75, longitudeMin: 91.4, longitudeMax: 92.15 },
  },
  Sylhet: {
    name: "Sylhet",
    latitude: 24.89,
    longitude: 91.87,
    bbox: { latitudeMin: 24.5, latitudeMax: 25.25, longitudeMin: 91.5, longitudeMax: 92.25 },
  },
  Khulna: {
    name: "Khulna",
    latitude: 22.85,
    longitude: 89.54,
    bbox: { latitudeMin: 22.45, latitudeMax: 23.25, longitudeMin: 89.15, longitudeMax: 89.95 },
  },
  Barisal: {
    name: "Barisal",
    latitude: 22.7,
    longitude: 90.35,
    bbox: { latitudeMin: 22.3, latitudeMax: 23.1, longitudeMin: 89.95, longitudeMax: 90.75 },
  },
  Dinajpur: {
    name: "Dinajpur",
    latitude: 25.62,
    longitude: 88.64,
    bbox: { latitudeMin: 25.25, latitudeMax: 26.0, longitudeMin: 88.25, longitudeMax: 89.0 },
  },
  Bogura: {
    name: "Bogura",
    latitude: 24.85,
    longitude: 89.38,
    bbox: { latitudeMin: 24.5, latitudeMax: 25.2, longitudeMin: 89.0, longitudeMax: 89.75 },
  },
  Comilla: {
    name: "Comilla",
    latitude: 23.46,
    longitude: 91.18,
    bbox: { latitudeMin: 23.1, latitudeMax: 23.85, longitudeMin: 90.8, longitudeMax: 91.55 },
  },
  Jessore: {
    name: "Jessore",
    latitude: 23.17,
    longitude: 89.21,
    bbox: { latitudeMin: 22.8, latitudeMax: 23.55, longitudeMin: 88.85, longitudeMax: 89.6 },
  },
  Pabna: {
    name: "Pabna",
    latitude: 24.01,
    longitude: 89.25,
    bbox: { latitudeMin: 23.65, latitudeMax: 24.35, longitudeMin: 88.9, longitudeMax: 89.6 },
  },
  Tangail: {
    name: "Tangail",
    latitude: 24.25,
    longitude: 89.92,
    bbox: { latitudeMin: 23.9, latitudeMax: 24.6, longitudeMin: 89.55, longitudeMax: 90.3 },
  },
  Kushtia: {
    name: "Kushtia",
    latitude: 23.9,
    longitude: 89.12,
    bbox: { latitudeMin: 23.55, latitudeMax: 24.25, longitudeMin: 88.75, longitudeMax: 89.5 },
  },
  Sirajganj: {
    name: "Sirajganj",
    latitude: 24.45,
    longitude: 89.7,
    bbox: { latitudeMin: 24.1, latitudeMax: 24.8, longitudeMin: 89.35, longitudeMax: 90.05 },
  },
  Faridpur: {
    name: "Faridpur",
    latitude: 23.61,
    longitude: 89.84,
    bbox: { latitudeMin: 23.25, latitudeMax: 23.95, longitudeMin: 89.5, longitudeMax: 90.2 },
  },
  Natore: {
    name: "Natore",
    latitude: 24.41,
    longitude: 88.98,
    bbox: { latitudeMin: 24.05, latitudeMax: 24.75, longitudeMin: 88.6, longitudeMax: 89.35 },
  },
};

/**
 * Normalizes a region into a stable, comparable key string:
 * e.g. "bbox:20.34:26.63:88.01:92.68"
 */
export const buildRegionKey = (
  latMin: number,
  latMax: number,
  lonMin: number,
  lonMax: number
): string => {
  const fmt = (v: number) => v.toFixed(2);
  return `bbox:${fmt(latMin)}:${fmt(latMax)}:${fmt(lonMin)}:${fmt(lonMax)}`;
};

/**
 * Resolves a district name (case-insensitive) to its coordinates and bounding box
 */
export const resolveDistrictCoordinates = (districtName?: string): IDistrictCoordinate | null => {
  if (!districtName) return null;
  const key = Object.keys(BANGLADESH_DISTRICTS).find(
    (k) => k.toLowerCase() === districtName.trim().toLowerCase()
  );
  return key ? BANGLADESH_DISTRICTS[key] : null;
};

export interface ILocationQuery {
  latitude?: number;
  longitude?: number;
  latitudeMin?: number;
  latitudeMax?: number;
  longitudeMin?: number;
  longitudeMax?: number;
  district?: string;
}

export interface IResolvedLocation {
  latitudeMin: number;
  latitudeMax: number;
  longitudeMin: number;
  longitudeMax: number;
  latitude: number;
  longitude: number;
  district?: string;
  regionKey: string;
}

/**
 * Resolves location from latitude/longitude, district, or explicit bounding box
 */
export const resolveLocation = (query: ILocationQuery): IResolvedLocation => {
  let latMin = query.latitudeMin;
  let latMax = query.latitudeMax;
  let lonMin = query.longitudeMin;
  let lonMax = query.longitudeMax;
  let district = query.district;
  let lat = query.latitude;
  let lon = query.longitude;

  // 1. If district is specified, use its bounding box
  if (district) {
    const resolved = resolveDistrictCoordinates(district);
    if (resolved) {
      district = resolved.name;
      latMin = latMin ?? resolved.bbox.latitudeMin;
      latMax = latMax ?? resolved.bbox.latitudeMax;
      lonMin = lonMin ?? resolved.bbox.longitudeMin;
      lonMax = lonMax ?? resolved.bbox.longitudeMax;
      lat = lat ?? resolved.latitude;
      lon = lon ?? resolved.longitude;
    }
  }

  // 2. If single point latitude & longitude are provided, buffer by +/- 0.25 deg
  if (query.latitude !== undefined && query.longitude !== undefined) {
    if (latMin === undefined || latMax === undefined || lonMin === undefined || lonMax === undefined) {
      latMin = parseFloat((query.latitude - 0.25).toFixed(4));
      latMax = parseFloat((query.latitude + 0.25).toFixed(4));
      lonMin = parseFloat((query.longitude - 0.25).toFixed(4));
      lonMax = parseFloat((query.longitude + 0.25).toFixed(4));
    }
  }

  // 3. Fallback to default Bangladesh bounding box
  if (latMin === undefined || latMax === undefined || lonMin === undefined || lonMax === undefined) {
    latMin = DEFAULT_BANGLADESH_BBOX.latitudeMin;
    latMax = DEFAULT_BANGLADESH_BBOX.latitudeMax;
    lonMin = DEFAULT_BANGLADESH_BBOX.longitudeMin;
    lonMax = DEFAULT_BANGLADESH_BBOX.longitudeMax;
  }

  lat = lat ?? parseFloat(((latMin + latMax) / 2).toFixed(4));
  lon = lon ?? parseFloat(((lonMin + lonMax) / 2).toFixed(4));

  const regionKey = buildRegionKey(latMin, latMax, lonMin, lonMax);

  return {
    latitudeMin: latMin,
    latitudeMax: latMax,
    longitudeMin: lonMin,
    longitudeMax: lonMax,
    latitude: lat,
    longitude: lon,
    district,
    regionKey,
  };
};

export interface IDateChunk {
  chunkIndex: number;
  totalChunks: number;
  start: string;
  end: string;
  daysCount: number;
}

const parseYMD = (dateStr: string): Date => {
  const clean = dateStr.replaceAll("-", "").trim();
  const y = parseInt(clean.slice(0, 4), 10);
  const m = parseInt(clean.slice(4, 6), 10) - 1;
  const d = parseInt(clean.slice(6, 8), 10);
  return new Date(Date.UTC(y, m, d));
};

export const formatDateYMD = (date: Date): string => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
};

export const getAllDatesInRange = (startStr: string, endStr: string): string[] => {
  const dates: string[] = [];
  const current = parseYMD(startStr);
  const end = parseYMD(endStr);

  while (current <= end) {
    dates.push(formatDateYMD(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
};

/**
 * Splits any date range into contiguous, non-overlapping chunks of maxDays
 */
export const splitDateRangeIntoChunks = (
  startStr: string,
  endStr: string,
  maxDays = 366
): IDateChunk[] => {
  const startDate = parseYMD(startStr);
  const endDate = parseYMD(endStr);

  if (startDate > endDate) {
    throw new Error(`Start date ${startStr} cannot be after end date ${endStr}`);
  }

  const chunks: IDateChunk[] = [];
  let chunkIndex = 1;
  const cursor = new Date(startDate.getTime());

  while (cursor <= endDate) {
    const chunkStart = new Date(cursor.getTime());
    const potentialEnd = new Date(chunkStart.getTime());
    potentialEnd.setUTCDate(potentialEnd.getUTCDate() + (maxDays - 1));

    const chunkEnd = potentialEnd > endDate ? new Date(endDate.getTime()) : potentialEnd;
    const diffTime = chunkEnd.getTime() - chunkStart.getTime();
    const daysCount = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

    chunks.push({
      chunkIndex,
      totalChunks: 0,
      start: formatDateYMD(chunkStart),
      end: formatDateYMD(chunkEnd),
      daysCount,
    });

    cursor.setTime(chunkEnd.getTime());
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    chunkIndex++;
  }

  chunks.forEach((c) => (c.totalChunks = chunks.length));
  return chunks;
};

/**
 * Identifies the seasonal climate category in Bangladesh
 */
export const getSeasonForDate = (dateStr: string): { season: string; year: number } => {
  const clean = dateStr.replaceAll("-", "").trim();
  const month = parseInt(clean.slice(4, 6), 10);
  let year = parseInt(clean.slice(0, 4), 10);

  if (month === 12 || month === 1 || month === 2) {
    if (month === 12) year += 1;
    return { season: "Winter (Dec-Feb)", year };
  } else if (month >= 3 && month <= 5) {
    return { season: "Pre-Monsoon / Summer (Mar-May)", year };
  } else if (month >= 6 && month <= 9) {
    return { season: "Monsoon (Jun-Sep)", year };
  } else {
    return { season: "Post-Monsoon / Autumn (Oct-Nov)", year };
  }
};
