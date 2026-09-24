// ─── Input ───────────────────────────────────────────────────────────────────

export interface INasaPowerInput {
    latitude: number;
    longitude: number;
    start: string; // YYYYMMDD
    end: string;   // YYYYMMDD
}

// ─── Processed Data Entry ────────────────────────────────────────────────────

export interface IDataEntry {
    date: string;
    value: number | null;
}

// ─── Output ──────────────────────────────────────────────────────────────────

export interface INasaPowerOutput {
    source: "NASA_POWER";
    location: {
        latitude: number;
        longitude: number;
        boundingBox: {
            latMin: number;
            latMax: number;
            lonMin: number;
            lonMax: number;
        };
    };
    period: {
        start: string;
        end: string;
    };
    data: {
        temperature: IDataEntry[];      // T2M — Temperature at 2 Meters (°C)
        rainfall: IDataEntry[];         // PRECTOTCORR — Precipitation (mm/day)
        solarRadiation: IDataEntry[];   // ALLSKY_SFC_SW_DWN — Solar Radiation (MJ/m²/day)
    };
}

// ─── NASA Raw API Shape ───────────────────────────────────────────────────────

export interface INasaRawParameterData {
    [date: string]: number; // e.g. { "20250101": 22.5, ... }
}

export interface INasaRawResponse {
    properties: {
        parameter: {
            T2M?: INasaRawParameterData;
            PRECTOTCORR?: INasaRawParameterData;
            ALLSKY_SFC_SW_DWN?: INasaRawParameterData;
        };
    };
}
