/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, RedisClientType } from "redis";
import { envVars } from "../../config/env.js";

class RedisService {
  private client: RedisClientType | null = null;
  private isConnected: boolean = false;
  private connectPromise: Promise<void> | null = null;

  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      try {
        const redisUrl = envVars.REDIS_URL;

        if (redisUrl) {
          this.client = createClient({ url: redisUrl });
        } else {
          const host = process.env.REDIS_HOST || "localhost";
          const port = parseInt(process.env.REDIS_PORT || "6379", 10);
          const password = process.env.REDIS_PASSWORD || undefined;

          this.client = createClient({
            socket: {
              host,
              port,
            },
            ...(password && { password }),
          });
        }

        this.client.on("error", (err) => {
          console.error("Redis Client Error:", err);
          this.isConnected = false;
        });

        this.client.on("connect", () => {
          console.log("Redis Client Connected");
          this.isConnected = true;
        });

        this.client.on("ready", () => {
          console.log("Redis Client Ready");
          this.isConnected = true;
        });

        this.client.on("end", () => {
          console.log("Redis Client Disconnected");
          this.isConnected = false;
        });

        this.client.on("reconnecting", () => {
          console.log("Redis Client Reconnecting");
        });

        await this.client.connect();
      } catch (error) {
        console.error("Failed to connect to Redis:", error);
        this.isConnected = false;
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  private async ensureConnection(): Promise<RedisClientType | null> {
    if (!this.isConnected || !this.client) {
      await this.connect();
    }
    if (!this.client || !this.isConnected) {
      return null;
    }
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    try {
      const client = await this.ensureConnection();
      if (!client) return null;
      return await client.get(key);
    } catch (error) {
      console.error("Redis GET error:", error);
      return null;
    }
  }

  async set(key: string, value: any, ttlInSeconds: number): Promise<void> {
    try {
      const client = await this.ensureConnection();
      if (!client) return;
      const stringValue =
        typeof value === "string" ? value : JSON.stringify(value);
      await client.set(key, stringValue, { EX: ttlInSeconds });
    } catch (error) {
      console.error("Redis SET error:", error);
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      console.error("Redis getJson error:", error);
      return null;
    }
  }

  async setJson(key: string, value: any, ttlInSeconds: number): Promise<void> {
    try {
      await this.set(key, JSON.stringify(value), ttlInSeconds);
    } catch (error) {
      console.error("Redis setJson error:", error);
    }
  }

  async update(key: string, value: any, ttlInSeconds: number): Promise<void> {
    await this.set(key, value, ttlInSeconds);
  }

  async delete(key: string): Promise<void> {
    try {
      const client = await this.ensureConnection();
      if (!client) return;
      await client.del(key);
    } catch (error) {
      console.error("Redis DELETE error:", error);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const client = await this.ensureConnection();
      if (!client) return false;
      await client.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }
}

export const redisService = new RedisService();