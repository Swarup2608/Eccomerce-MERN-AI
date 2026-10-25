import { MongoClient, type Db } from "mongodb";
import { config } from "./config.js";

// The connection promise is shared, so concurrent first calls open one client and closeDb can wait for one still connecting.
let client: Promise<MongoClient> | undefined;
export async function getDb(): Promise<Db> {
  client ??= new MongoClient(config.mongoUri, { appName: "stylist-node", maxPoolSize: 5 }).connect().catch((err: unknown) => {
    client = undefined;
    throw err;
  });
  return (await client).db(config.dbName);
}
export const closeDb = async (): Promise<void> => (await client?.catch(() => undefined))?.close();
