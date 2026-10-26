import { EmployerSearchQuery } from "@jobfit/shared";
import { env } from "cloudflare:workers";

import { withDb } from "~/lib/db.server";
import { searchEmployers } from "~/lib/employers.server";

import type { Route } from "./+types/api.employers";

export async function loader({ request }: Route.LoaderArgs) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = EmployerSearchQuery.safeParse(params);
  if (!query.success) {
    return Response.json(
      { error: "Search needs 2 to 100 characters in q." },
      { status: 400 },
    );
  }
  const employers = await withDb(env.DATABASE_URL, (db) =>
    searchEmployers(db, query.data.q),
  );
  return Response.json({ employers });
}
