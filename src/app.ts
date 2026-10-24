import express, { Application, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { IndexRoute } from './app/routes/index.js';
import { globalErrorHandler } from './middleware/globalErrorHandeler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './app/lib/auth.js';
import path from 'path';
import { envVars } from './config/env.js';
import cors from "cors";
import { DeviceRoute } from './app/module/Device/device.route.js';
import { CropWiseAiRoute } from './app/module/CropWiseAi/cropwise.route.js';
import { prisma } from './app/lib/prisma.js';

const app:Application = express();

app.set("view engine", "ejs");
app.set("views",path.resolve(process.cwd(), `src/app/templates`) )

app.use(cors({
    origin : [envVars.FRONTEND_URL, envVars.BETTER_AUTH_URL, "http://localhost:3000", "http://localhost:5000", "http://localhost:5007"],
    credentials : true,
    methods : ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders : ["Content-Type", "Authorization"]
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use("/api/auth", toNodeHandler(auth));

// Firmware compatibility and health checks
app.get(['/health', '/api/health'], async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      success: true,
      status: "HEALTHY",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: "connected",
      service: "CropWise AI API",
    });
  } catch (err: any) {
    res.status(503).json({
      success: false,
      status: "UNHEALTHY",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: "disconnected",
      error: err?.message || "Database check failed",
    });
  }
});

app.use("/api/device", DeviceRoute);
app.use("/api/cropwise", CropWiseAiRoute);
app.use("/api/cropwise-ai", CropWiseAiRoute);
app.use("/api/proboy", CropWiseAiRoute);

app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'CropWise AI Backend is running',
    version: '1.0.0',
    docs: '/api/v1',
  });
});

app.use("/api/v1", IndexRoute);

app.use(globalErrorHandler);
app.use(notFoundHandler);


export default app;