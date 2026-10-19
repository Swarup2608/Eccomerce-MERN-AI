import { MongoClient, type Db } from "mongodb";
import { config } from "./config.js";

let client: MongoClient | undefined;
export async function getDb(): Promise<Db> {
  client ??= await new MongoClient(config.mongoUri, { appName: "stylist-node", maxPoolSize: 5 }).connect();
  return client.db(config.dbName);
}
export const closeDb = async (): Promise<void> => client?.close();
