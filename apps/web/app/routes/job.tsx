import { ScreeningReport } from "@jobfit/shared";
import { env } from "cloudflare:workers";
import { Form, data, redirect, useNavigation } from "react-router";

import { Report } from "~/components/Report";
import { agent, currentUserId } from "~/lib/auth.server";
import { withDb } from "~/lib/db.server";
import { AgentError, getJob, screenJob } from "~/lib/jobs.server";

import type { Route } from "./+types/job";

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.report?.parsed?.title ?? "Job posting";
  return [{ title: `${title} · JobFit` }];
}

export async function loader(args: Route.LoaderArgs) {
  const userId = await currentUserId(args);
  if (!userId) throw redirect("/");
  // RLS returns no row for someone else's job, so it 404s like a missing one.
  const job = await withDb(env.DATABASE_URL, (db) =>
    getJob(db, userId, args.params.id),
  );
  if (!job) throw data(null, { status: 404 });
  return {
    jobText: job.rawText,
    report: job.screening ? ScreeningReport.parse(job.screening) : null,
  };
}

export async function action(args: Route.ActionArgs) {
  const userId = await currentUserId(args);
  if (!userId) throw redirect("/");
  return withDb(env.DATABASE_URL, async (db) => {
    const job = await getJob(db, userId, args.params.id);
    if (!job) throw data(null, { status: 404 });
    try {
      await screenJob(db, agent(), userId, job);
      return { error: null };
    } catch (e) {
      if (!(e instanceof AgentError)) throw e;
      return { error: e.message };
    }
  });
}

export default function Job({ loaderData, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === "submitting";
  if (loaderData.report) {
    return (
      <main>
        <Report report={loaderData.report} jobText={loaderData.jobText} />
      </main>
    );
  }
  return (
    <main className="measure">
      <h1 className="text-2xl font-bold">This job hasn't been screened yet</h1>
      {actionData?.error && (
        <p role="alert" className="mt-4 border-l-4 border-denial pl-3">
          {actionData.error}
        </p>
      )}
      <Form method="post" className="mt-6">
        <button
          type="submit"
          disabled={busy}
          className="rounded-[var(--radius-field)] bg-ink px-5 py-2 text-lg font-semibold text-paper hover:bg-guilloche disabled:bg-ink-muted"
        >
          {busy ? "Reading the posting…" : "Screen this job"}
        </button>
      </Form>
      <blockquote className="mt-8 whitespace-pre-wrap rounded-[var(--radius-sheet)] bg-sheet p-4 sm:p-6">
        {loaderData.jobText}
      </blockquote>
    </main>
  );
}
