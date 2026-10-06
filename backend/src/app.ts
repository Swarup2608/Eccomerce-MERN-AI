import express from "express";
import { isMongoReady } from "./config/mongoose.js";
import { isRedisReady } from "./config/redis.js";

const app = express();
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

export default app;