import { ScreenInput } from "@jobfit/shared";
import { env } from "cloudflare:workers";

import { currentEmail, currentUserId } from "~/lib/auth.server";
import { withDb } from "~/lib/db.server";
import {
  DAILY_SCREENINGS,
  createJob,
  getVisaStatus,
  saveUser,
} from "~/lib/jobs.server";

import type { Route } from "./+types/api.jobs";

export async function action(args: Route.ActionArgs) {
  const userId = await currentUserId(args);
  if (!userId) return Response.json({ error: "Sign in." }, { status: 401 });
  const input = ScreenInput.safeParse(
    await args.request.json().catch(() => null),
  );
  if (!input.success) {
    return Response.json(
      {
        error:
          "Send {jobText}: the full job description, 50 to 30,000 characters.",
      },
      { status: 400 },
    );
  }
  return withDb(env.DATABASE_URL, async (db) => {
    const { exists, visaStatus } = await getVisaStatus(db, userId);
    if (!exists) {
      await saveUser(db, userId, await currentEmail(args, userId), visaStatus);
    }
    const id = await createJob(db, userId, input.data.jobText);
    if (!id) {
      return Response.json(
        { error: `Daily limit of ${DAILY_SCREENINGS} jobs reached.` },
        { status: 429 },
      );
    }
    return Response.json({ id }, { status: 201 });
  });
}
