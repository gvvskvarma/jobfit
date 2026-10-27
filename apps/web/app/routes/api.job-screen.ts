import { env } from "cloudflare:workers";

import { agent, currentUserId } from "~/lib/auth.server";
import { withDb } from "~/lib/db.server";
import { AgentError, getJob, screenJob } from "~/lib/jobs.server";

import type { Route } from "./+types/api.job-screen";

export async function action(args: Route.ActionArgs) {
  const userId = await currentUserId(args);
  if (!userId) return Response.json({ error: "Sign in." }, { status: 401 });
  return withDb(env.DATABASE_URL, async (db) => {
    const job = await getJob(db, userId, args.params.id);
    if (!job) return Response.json({ error: "No such job." }, { status: 404 });
    try {
      return Response.json(await screenJob(db, agent(), userId, job));
    } catch (e) {
      if (!(e instanceof AgentError)) throw e;
      // 422 means the posting itself was rejected; anything else is on our side.
      return Response.json(
        { error: e.message },
        { status: e.status === 422 ? 422 : 502 },
      );
    }
  });
}
