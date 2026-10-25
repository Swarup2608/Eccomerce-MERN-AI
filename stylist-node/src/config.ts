export const config = {
  mongoUri: process.env.MONGODB_URI ?? "mongodb://localhost:27017",
  dbName: process.env.MONGODB_DB_NAME || undefined,
  port: Number(process.env.PORT ?? 4100),
  // Same secret and cookie the shop API uses, so a signed-in shopper is recognised without a second login.
  accessSecret: process.env.ACCESS_TOKEN_SECRET ?? "",
  accessCookie: process.env.STYLIST_ACCESS_COOKIE ?? "localhost-user-access-token",
  // Local Ollama: no API fees. If it is down or slow, every feature falls back to the rule-based path.
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  // Set for Ollama Cloud (OLLAMA_URL=https://ollama.com); sent as a Bearer token. Empty for a local server.
  ollamaApiKey: process.env.OLLAMA_API_KEY ?? "",
  // Ollama Cloud hosts no embedding models, so embeddings can point at a different server than chat.
  ollamaEmbedUrl: process.env.OLLAMA_EMBED_URL || (process.env.OLLAMA_URL ?? "http://localhost:11434"),
  chatModel: process.env.STYLIST_CHAT_MODEL ?? "qwen3:4b-instruct",
  embedModel: process.env.STYLIST_EMBED_MODEL ?? "nomic-embed-text",
  llmTimeoutMs: Number(process.env.STYLIST_LLM_TIMEOUT_MS ?? 20_000),
  // How often new or edited products are embedded for semantic search; 0 turns it off (npm run embed still works).
  reindexMinutes: Number(process.env.STYLIST_REINDEX_MINUTES ?? 15),
  storefrontUrl: process.env.STOREFRONT_URL ?? "http://localhost:3000",
};
