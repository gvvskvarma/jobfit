import { ScreeningReport } from "@jobfit/shared";
import { env } from "cloudflare:workers";
import { Form, data, redirect, useNavigation } from "react-router";

import { Report } from "~/components/Report";
import { Working } from "~/components/terminal";
import { Panel, button } from "~/components/ui";
import { agent, currentUserId } from "~/lib/auth.server";
import { withDb } from "~/lib/db.server";
import { AgentError, getJob, screenJob } from "~/lib/jobs.server";

import type { Route } from "./+types/job";

const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

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
    jobUrl: job.source?.startsWith("http") ? job.source : null,
    screenedOn: day.format(job.createdAt),
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
        <Report
          report={loaderData.report}
          jobText={loaderData.jobText}
          jobUrl={loaderData.jobUrl}
          screenedOn={loaderData.screenedOn}
        />
      </main>
    );
  }
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">
        <span aria-hidden className="mr-3 text-caution">
          !
        </span>
        This job hasn't been screened yet
      </h1>
      {actionData?.error && (
        <p role="alert" className="border-l-2 border-denial pl-3 text-denial">
          ✗ {actionData.error}
        </p>
      )}
      <Form method="post" className="space-y-3">
        <button type="submit" disabled={busy} className={button}>
          <span aria-hidden>◼</span> Screen this job
        </button>
        {busy && <Working steps={["Screening the posting"]} />}
      </Form>
      <Panel title="posting">
        <blockquote className="whitespace-pre-wrap text-sm not-italic">
          {loaderData.jobText}
        </blockquote>
      </Panel>
    </main>
  );
}
