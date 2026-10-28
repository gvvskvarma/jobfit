import { EvidenceDraft } from "@jobfit/shared";
import { env } from "cloudflare:workers";

import { agent, currentUserId } from "~/lib/auth.server";
import { withDb } from "~/lib/db.server";
import {
  deleteEvidence,
  embedPending,
  updateEvidence,
} from "~/lib/evidence.server";

import type { Route } from "./+types/api.evidence-item";

/** PUT replaces an item (and re-embeds it); DELETE removes it. */
export async function action(args: Route.ActionArgs) {
  const userId = await currentUserId(args);
  if (!userId) return Response.json({ error: "Sign in." }, { status: 401 });
  const { id } = args.params;
  const method = args.request.method;
  if (method === "DELETE") {
    return withDb(env.DATABASE_URL, async (db) =>
      (await deleteEvidence(db, userId, id))
        ? new Response(null, { status: 204 })
        : Response.json({ error: "No such item." }, { status: 404 }),
    );
  }
  if (method !== "PUT") {
    return Response.json({ error: "Use PUT or DELETE." }, { status: 405 });
  }
  const item = EvidenceDraft.safeParse(
    await args.request.json().catch(() => null),
  );
  if (!item.success) {
    return Response.json(
      { error: item.error.issues[0].message },
      { status: 400 },
    );
  }
  return withDb(env.DATABASE_URL, async (db) => {
    if (!(await updateEvidence(db, userId, id, item.data))) {
      return Response.json({ error: "No such item." }, { status: 404 });
    }
    await embedPending(agent(), userId);
    return Response.json({ id });
  });
}
