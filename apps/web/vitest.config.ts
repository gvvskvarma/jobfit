import { existsSync } from "node:fs";

import { defineConfig } from "vitest/config";

// Database tests read DATABASE_URL from the root .env.local, like the Python tests.
const envFile = new URL("../../.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Separate from vite.config.ts: the Cloudflare plugin can't run inside Vitest.
export default defineConfig({ resolve: { tsconfigPaths: true } });
