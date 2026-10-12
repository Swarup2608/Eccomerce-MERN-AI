import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { loadConfig } from "../config/env.js";

// Lets the admin browser upload product images straight to the R2 bucket (presigned PUT). Without this rule R2 answers
// the browser's CORS preflight with 403 and every upload fails. Safe to re-run; it replaces the bucket's CORS rules.
//   npm run r2:cors                       (allows ADMIN_URL)
//   R2_CORS_ORIGINS=https://admin.example.com,http://localhost:3001 npm run r2:cors
async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.r2) throw new Error("R2 is not configured (set the R2_* values in backend/.env)");

  const origins = (process.env.R2_CORS_ORIGINS ?? config.adminUrl).split(",").map((origin) => origin.trim()).filter(Boolean);
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey },
  });

  await client.send(
    new PutBucketCorsCommand({
      Bucket: config.r2.bucket,
      CORSConfiguration: { CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ["PUT"], AllowedHeaders: ["content-type"], MaxAgeSeconds: 3600 }] },
    }),
  );
  const applied = await client.send(new GetBucketCorsCommand({ Bucket: config.r2.bucket }));
  process.stdout.write(`CORS rules on ${config.r2.bucket}:\n${JSON.stringify(applied.CORSRules, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const hint = /access denied|forbidden|unauthorized/i.test(message) ? "\nThe R2 API token may only allow object access. Add the rule in the dashboard instead (R2 > bucket > Settings > CORS Policy) or use an Admin Read & Write token." : "";
  process.stderr.write(`Setting R2 CORS failed: ${message}${hint}\n`);
  process.exit(1);
});
