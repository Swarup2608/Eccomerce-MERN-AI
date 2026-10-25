import { buildIndex } from "./embeddings.js";
import { closeDb } from "./db.js";

const r = await buildIndex((done, total) => process.stdout.write(`\rembedding ${done}/${total}`));
console.log(`\nindexed ${r.indexed}, unchanged ${r.skipped}, total ${r.total}`);
await closeDb();
