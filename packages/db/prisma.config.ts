import { existsSync } from "node:fs";

import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer reads .env files; the repo keeps secrets in the root .env.local.
const envFile = new URL("../../.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
