import app from "./app.js";
import { prisma } from "./app/lib/prisma.js";
import { redisService } from "./app/lib/redis.js";

const port = process.env.PORT || 8000;

const bootstrap = async () => {
  try {
    await redisService.connect();
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Error starting the server:", error);
  }
};
bootstrap();