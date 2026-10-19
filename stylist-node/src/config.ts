export const config = {
  mongoUri: process.env.MONGODB_URI ?? "mongodb://localhost:27017",
  dbName: process.env.MONGODB_DB_NAME || undefined,
  port: Number(process.env.PORT ?? 4100),
  // Same secret and cookie the shop API uses, so a signed-in shopper is recognised without a second login.
  accessSecret: process.env.ACCESS_TOKEN_SECRET ?? "",
  accessCookie: process.env.STYLIST_ACCESS_COOKIE ?? "localhost-user-access-token",
  storefrontUrl: process.env.STOREFRONT_URL ?? "http://localhost:3000",
};
