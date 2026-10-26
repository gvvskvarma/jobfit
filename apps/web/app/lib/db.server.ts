import pg from "pg";

export type Db = Pick<pg.Client, "query">;

// ponytail: one connection per request; put Cloudflare Hyperdrive (pooling) in front of Neon at deploy time (M8).
export async function withDb<T>(
  url: string,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
