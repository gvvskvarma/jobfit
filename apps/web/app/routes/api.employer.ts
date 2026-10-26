import { env } from "cloudflare:workers";

import { withDb } from "~/lib/db.server";
import { getEmployer } from "~/lib/employers.server";

import type { Route } from "./+types/api.employer";

export async function loader({ params }: Route.LoaderArgs) {
  const employer = await withDb(env.DATABASE_URL, (db) =>
    getEmployer(db, params.id),
  );
  if (!employer)
    return Response.json(
      { error: "No employer with that id." },
      { status: 404 },
    );
  return Response.json({ employer });
}
