/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";
import { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { EmbeddingService } from "./embedding.service.js";

export interface DocumentInput {
  chunkKey?: string;
  sourceType: string;
  sourceId: string;
  sourceLabel?: string;
  content: string;
  metadata?: Record<string, any>;
}

export class IndexingService {
  private embeddingService: EmbeddingService;

  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Upsert a single document embedding into Postgres pgvector
   */
  async upsertDocumentEmbedding(doc: DocumentInput) {
    const chunkKey = doc.chunkKey || `${doc.sourceType}_${doc.sourceId}_${crypto.randomUUID().slice(0, 8)}`;
    const embedding = await this.embeddingService.generateEmbedding(doc.content);

    if (!embedding || embedding.length === 0) {
      throw new Error(`Failed to generate embedding for chunkKey: ${chunkKey}`);
    }

    const vectorLiteral = `[${embedding.join(",")}]`;
    const metadataJson = doc.metadata ? JSON.stringify(doc.metadata) : null;
    const newId = crypto.randomUUID();

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "document_embeddings" (
        "id",
        "chunkKey",
        "sourceType",
        "sourceId",
        "sourceLabel",
        "content",
        "metadata",
        "embedding",
        "isDeleted",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${newId},
        ${chunkKey},
        ${doc.sourceType},
        ${doc.sourceId},
        ${doc.sourceLabel ?? null},
        ${doc.content},
        ${metadataJson}::jsonb,
        CAST(${vectorLiteral} AS vector),
        false,
        NOW(),
        NOW()
      )
      ON CONFLICT ("chunkKey") DO UPDATE SET
        "sourceType" = EXCLUDED."sourceType",
        "sourceId" = EXCLUDED."sourceId",
        "sourceLabel" = EXCLUDED."sourceLabel",
        "content" = EXCLUDED."content",
        "metadata" = EXCLUDED."metadata",
        "embedding" = EXCLUDED."embedding",
        "isDeleted" = false,
        "updatedAt" = NOW();
    `);

    return {
      chunkKey,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      sourceLabel: doc.sourceLabel,
      vectorLength: embedding.length,
      success: true,
    };
  }

  /**
   * Ingest an array of documents sequentially or in batches
   */
  async indexDocuments(documents: DocumentInput[]) {
    const results = [];
    for (const doc of documents) {
      try {
        const res = await this.upsertDocumentEmbedding(doc);
        results.push(res);
      } catch (err: any) {
        console.error(`Error indexing document ${doc.chunkKey || doc.sourceId}:`, err);
        results.push({
          sourceId: doc.sourceId,
          success: false,
          error: err.message,
        });
      }
    }
    return results;
  }

  /**
   * Ingest pre-configured NASA Space Apps knowledge base
   */
  async indexSpaceKnowledgeData() {
    const spaceKnowledgeChunks: DocumentInput[] = [
      {
        chunkKey: "nasa_mission_artemis_overview",
        sourceType: "nasa_mission",
        sourceId: "artemis_program",
        sourceLabel: "NASA Artemis Program",
        content: `The NASA Artemis program aims to land the first woman and first person of color on the Moon, using innovative technologies to explore more of the lunar surface than ever before. Artemis utilizes the Space Launch System (SLS) rocket, Orion spacecraft, the lunar Gateway space station, and commercial Human Landing Systems (HLS). The long-term goal of Artemis is establishing a sustainable human presence on the Moon as a stepping stone for future crewed missions to Mars.`,
        metadata: {
          category: "Human Spaceflight",
          target: "Moon & Mars",
          launchVehicle: "SLS Rocket",
        },
      },
      {
        chunkKey: "nasa_mission_jwst_overview",
        sourceType: "nasa_mission",
        sourceId: "jwst",
        sourceLabel: "James Webb Space Telescope (JWST)",
        content: `The James Webb Space Telescope (JWST) is NASA's flagship infrared space observatory, launched in December 2021 as a collaboration with ESA and CSA. Positioned at Sun-Earth Lagrange Point 2 (L2), JWST observes deep cosmic history, from the first galaxies formed after the Big Bang to the atmospheric composition of exoplanets using high-resolution infrared spectrographs including NIRCam, NIRSpec, and MIRI.`,
        metadata: {
          category: "Astrophysics & Deep Space",
          location: "Sun-Earth L2",
          instruments: ["NIRCam", "NIRSpec", "MIRI", "FGS/NIRISS"],
        },
      },
      {
        chunkKey: "nasa_mission_perseverance_mars",
        sourceType: "nasa_mission",
        sourceId: "mars_perseverance",
        sourceLabel: "Mars 2020 Perseverance Rover",
        content: `NASA's Perseverance rover landed in Mars' Jezero Crater in February 2021. Its primary astrobiology mission is seeking signs of ancient microbial life and characterizing the planet's geology and climate history. Perseverance collects rock and regolith core samples for future Earth return. The rover also carried the Ingenuity helicopter, the first powered aircraft to fly on another planet, and demonstrated in-situ oxygen production via the MOXIE experiment.`,
        metadata: {
          category: "Planetary Science",
          target: "Mars",
          location: "Jezero Crater",
          payloads: ["MOXIE", "SuperCam", "PIXL", "SHERLOC", "Ingenuity"],
        },
      },
      {
        chunkKey: "nasa_earth_observation_landsat",
        sourceType: "nasa_earth_science",
        sourceId: "landsat_program",
        sourceLabel: "Landsat Earth Observation Program",
        content: `The USGS and NASA Landsat program represents the longest continuous space-based record of Earth's land surface, operating since 1972. Landsat satellites monitor agricultural health, deforestation, urban expansion, glacial retreat, and wildfire burn scars using multispectral and thermal infrared imaging. Landsat 8 and 9 collect vital environmental data supporting global food security, climate resilience, and natural disaster response.`,
        metadata: {
          category: "Earth Observation & Climate",
          partners: ["NASA", "USGS"],
          focus: ["Vegetation Index (NDVI)", "Surface Temperature", "Land Use"],
        },
      },
      {
        chunkKey: "nasa_planetary_defense_dart",
        sourceType: "nasa_planetary_defense",
        sourceId: "dart_mission",
        sourceLabel: "DART (Double Asteroid Redirection Test)",
        content: `NASA's Double Asteroid Redirection Test (DART) was the world's first planetary defense technology demonstration. In September 2022, DART successfully impacted Dimorphos, the moonlet of asteroid Didymos, deliberately altering its orbital period around the primary asteroid by 33 minutes. The mission proved that kinetic impact is a viable strategy to deflect hazardous near-Earth asteroids threatening Earth.`,
        metadata: {
          category: "Planetary Defense",
          target: "Dimorphos (Asteroid)",
          impactDate: "2022-09-26",
          result: "Orbital period changed by 33 minutes",
        },
      },
      {
        chunkKey: "nasa_exoplanet_tess_exploration",
        sourceType: "nasa_exoplanets",
        sourceId: "tess_mission",
        sourceLabel: "TESS (Transiting Exoplanet Survey Satellite)",
        content: `NASA's Transiting Exoplanet Survey Satellite (TESS) surveys the brightest stars near Earth to discover transiting exoplanets, including Earth-sized and super-Earth worlds in stellar habitable zones. TESS monitors stellar light dips caused by orbiting planets across nearly the entire sky, identifying priority candidates for atmospheric characterization by space observatories like JWST and future missions like the Habitable Worlds Observatory (HWO).`,
        metadata: {
          category: "Exoplanets",
          method: "Transit Photometry",
          orbit: "High Earth Orbit (P/2 resonance)",
        },
      },
      {
        chunkKey: "nasa_earth_science_pace",
        sourceType: "nasa_earth_science",
        sourceId: "pace_mission",
        sourceLabel: "PACE (Plankton, Aerosol, Cloud, ocean Ecosystem)",
        content: `Launched in February 2024, NASA's PACE satellite studies ocean health, marine ecology, and atmospheric dynamics. Using the Ocean Color Instrument (OCI) and multi-angle polarimeters (SPEXone and HARP2), PACE measures aquatic ecosystems, phytoplankton distribution, atmospheric aerosols, and cloud microphysics to advance our understanding of carbon exchange between the atmosphere and oceans.`,
        metadata: {
          category: "Earth Science",
          launchYear: 2024,
          focus: ["Ocean Health", "Phytoplankton", "Aerosols", "Carbon Cycle"],
        },
      },
      {
        chunkKey: "nasa_iss_microgravity_research",
        sourceType: "nasa_space_station",
        sourceId: "iss_research",
        sourceLabel: "International Space Station (ISS) Microgravity Research",
        content: `The International Space Station serves as a premier microgravity laboratory in low Earth orbit. Scientific investigations aboard the ISS focus on cellular biology, crystal growth for drug development, materials science, fluid dynamics, and long-duration spaceflight effects on human bone density and cardiovascular systems. Research conducted on ISS directly benefits medicine on Earth while preparing astronauts for deep space exploration.`,
        metadata: {
          category: "Microgravity Science",
          orbit: "Low Earth Orbit (LEO)",
          collaborators: ["NASA", "ESA", "JAXA", "CSA", "Roscosmos"],
        },
      },
    ];

    console.log(`Starting ingestion of ${spaceKnowledgeChunks.length} NASA Space knowledge chunks...`);
    const results = await this.indexDocuments(spaceKnowledgeChunks);
    const successfulCount = results.filter((r) => r.success).length;

    return {
      message: `NASA Space knowledge data ingestion completed: ${successfulCount}/${spaceKnowledgeChunks.length} chunks indexed.`,
      totalChunks: spaceKnowledgeChunks.length,
      successfulCount,
      results,
    };
  }
}
