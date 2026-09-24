import { envVars } from "../../../config/env.js";
import AppError from "../../errorHelpers/appError.js";
import status from "http-status";
import { SMAP_CONSTANTS } from "./smap.constants.js";

export interface ICmrGranule {
  id: string;
  title: string;
  timeStart: string;
  opendapUrl: string;
}

export class SmapClient {
  private static readonly cmrBaseUrl = SMAP_CONSTANTS.CMR_BASE_URL;
  private static readonly collectionId = SMAP_CONSTANTS.COLLECTION_CONCEPT_ID;

  private static getAuthHeaders(): Record<string, string> {
    const token = envVars.SMAP.EARTHDATA_TOKEN || envVars.IMERG.EARTHDATA_TOKEN;
    if (!token) {
      throw new AppError(
        "NASA Earthdata token is missing. Please configure NASA_EARTHDATA_TOKEN in .env",
        status.UNAUTHORIZED
      );
    }
    return {
      Authorization: `Bearer ${token}`,
      Accept: "*/*",
      "User-Agent": "FieldShift-Backend/1.0",
    };
  }

  /**
   * Search CMR for SMAP granules covering a specific day
   */
  public static async searchGranulesForDate(dateStr: string): Promise<ICmrGranule[]> {
    // dateStr is YYYYMMDD
    const y = dateStr.slice(0, 4);
    const m = dateStr.slice(4, 6);
    const d = dateStr.slice(6, 8);
    const startIso = `${y}-${m}-${d}T00:00:00Z`;
    const endIso = `${y}-${m}-${d}T23:59:59Z`;

    const cmrUrl = `${this.cmrBaseUrl}/search/granules.json?collection_concept_id=${this.collectionId}&temporal=${startIso},${endIso}&page_size=8&sort_key=start_date`;

    try {
      const response = await fetch(cmrUrl, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new AppError(
          `NASA CMR search failed with status ${response.status}: ${response.statusText}`,
          status.BAD_GATEWAY
        );
      }

      const body = (await response.json()) as {
        feed?: {
          entry?: Array<{
            id: string;
            title: string;
            time_start: string;
            links?: Array<{ href: string; rel?: string }>;
          }>;
        };
      };

      const entries = body.feed?.entry || [];
      const granules: ICmrGranule[] = [];

      for (const entry of entries) {
        // Find OPeNDAP link
        const opendapLink = entry.links?.find(
          (l) =>
            l.href.includes("opendap.earthdata.nasa.gov") ||
            l.rel?.includes("opendap")
        );

        const opendapUrl =
          opendapLink?.href ||
          `https://opendap.earthdata.nasa.gov/collections/${this.collectionId}/granules/${entry.title}`;

        granules.push({
          id: entry.id,
          title: entry.title,
          timeStart: entry.time_start,
          opendapUrl,
        });
      }

      return granules;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        `Failed to reach NASA CMR service: ${(err as Error).message}`,
        status.BAD_GATEWAY
      );
    }
  }

  /**
   * Fetch spatial subset from NASA OPeNDAP ASCII endpoint
   */
  public static async fetchOpendapSubset(
    opendapBaseUrl: string,
    rowMin: number,
    rowMax: number,
    colMin: number,
    colMax: number
  ): Promise<string> {
    const rawUrl = opendapBaseUrl.endsWith(".h5")
      ? `${opendapBaseUrl}.ascii`
      : `${opendapBaseUrl.replace(/\.html$/, "")}.ascii`;

    const varQuery = [
      `/Geophysical_Data/sm_surface[${rowMin}:${rowMax}][${colMin}:${colMax}]`,
      `/Geophysical_Data/sm_rootzone[${rowMin}:${rowMax}][${colMin}:${colMax}]`,
      `cell_lat[${rowMin}:${rowMax}][${colMin}:${colMax}]`,
      `cell_lon[${rowMin}:${rowMax}][${colMin}:${colMax}]`,
    ].join(",");

    const fullUrl = `${rawUrl}?${encodeURI(varQuery)}`;

    try {
      const response = await fetch(fullUrl, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new AppError(
          `NASA OPeNDAP returned HTTP ${response.status}: ${errText.slice(0, 200)}`,
          response.status === 401 || response.status === 403
            ? status.UNAUTHORIZED
            : status.BAD_GATEWAY
        );
      }

      return await response.text();
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        `Failed to fetch SMAP data from OPeNDAP: ${(err as Error).message}`,
        status.BAD_GATEWAY
      );
    }
  }
}
