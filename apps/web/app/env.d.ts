// Secrets come from .dev.vars locally and Wrangler secrets in production, so
// `wrangler types` can't see them; declare them here.
declare namespace Cloudflare {
  interface Env {
    DATABASE_URL: string;
    CLERK_PUBLISHABLE_KEY: string;
    CLERK_SECRET_KEY: string;
    AGENT_URL: string;
    AGENT_HMAC_SECRET: string;
  }
}
