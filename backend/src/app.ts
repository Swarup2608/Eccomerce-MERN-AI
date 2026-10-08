import express from "express";
import { isMongoReady } from "./config/mongoose.js";
import { isRedisReady } from "./config/redis.js";
import { requestId } from "./middleware/requestId.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(requestId);
app.use(requestLogger);
app.use(express.json());

app.get("/api/v1/health",(_req,res)=>{
  res.status(200).json({
    success: true,
    message: "API is healthy",
  });
});

app.get("/api/v1/ready",(_req,res)=>{
    const mongoReady = isMongoReady();
    const redisReady = isRedisReady();
    const allReady = mongoReady && redisReady;
    res.status(allReady ? 200 : 503).json({
        success: allReady,
        message: allReady ? "API is ready" : "API is not ready",
        dependencies: {
            mongo: mongoReady,
            redis: redisReady,
        }
    });
});


app.use(errorHandler);

export default app;