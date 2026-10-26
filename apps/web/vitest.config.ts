import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: the Cloudflare plugin can't run inside Vitest.
export default defineConfig({ resolve: { tsconfigPaths: true } });
