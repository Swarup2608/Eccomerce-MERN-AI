import app from "./app.js";
import { env } from "./config/env.js";
import { connectMongoose } from "./config/mongoose.js";
import { connectRedis } from "./config/redis.js";


const PORT = env.PORT; 

async function bootstrap() : Promise<void> {
    await connectMongoose();
    await connectRedis();
    app.listen(PORT,()=>{
        console.log(`Server is running on port ${PORT}`);
    });
}

bootstrap().catch((error) => {
    console.error("Failed to bootstrap the server", error);
    process.exit(1);
});