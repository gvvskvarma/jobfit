import { DiscoverQuery } from "@jobfit/shared";
import { env } from "cloudflare:workers";

import { withDb } from "~/lib/db.server";
import { discoverSponsors, latestFiscalYear } from "~/lib/employers.server";

import type { Route } from "./+types/api.discover";

export async function loader({ request }: Route.LoaderArgs) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = DiscoverQuery.safeParse(params);
  if (!query.success) {
    return Response.json(
      { error: "Pick a title bucket; state is two letters and fy is a year." },
      { status: 400 },
    );
  }
  return withDb(env.DATABASE_URL, async (db) => {
    const fy = query.data.fy ?? (await latestFiscalYear(db));
    if (fy === null) return Response.json({ fiscalYear: null, employers: [] });
    const employers = await discoverSponsors(db, { ...query.data, fy });
    return Response.json({ fiscalYear: fy, employers });
  });
}
