import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads .env files; the repo keeps secrets in the root .env.local.
const envFile = new URL("../../.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Optional so `prisma generate` (typecheck, CI) works without a database.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
