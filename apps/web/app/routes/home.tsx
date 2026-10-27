import { Show, SignInButton } from "@clerk/react-router";
import { ScreenInput, ScreeningReport, VISA_STATUSES } from "@jobfit/shared";
import { env } from "cloudflare:workers";
import { useRef } from "react";
import { Form, Link, redirect, useNavigation } from "react-router";

import { agent, currentEmail, currentUserId } from "~/lib/auth.server";
import { withDb } from "~/lib/db.server";
import {
  AgentError,
  DAILY_SCREENINGS,
  createJob,
  getJob,
  getVisaStatus,
  recentJobs,
  saveUser,
  screenJob,
  type VisaStatus,
} from "~/lib/jobs.server";
import sample from "~/lib/sample-report.json";

import type { Route } from "./+types/home";

const VERDICT_TAG: Record<ScreeningReport["verdict"], [string, string]> = {
  apply: ["Apply", "border-approval text-approval"],
  apply_with_caution: [
    "Apply with caution",
    "border-ink bg-highlighter text-ink",
  ],
  skip: ["Skip", "border-denial text-denial"],
};

const VISA_LABEL: Record<VisaStatus, string> = {
  H1B: "H-1B",
  OPT: "OPT",
  STEM_OPT: "STEM OPT",
  L1: "L-1",
  GC_PENDING: "Green card pending",
  CITIZEN_OR_GC: "US citizen or green card holder",
  OTHER: "Something else",
};

export function meta() {
  return [
    { title: "JobFit: check a job before you apply" },
    {
      name: "description",
      content:
        "Paste a job posting to see whether it can sponsor your visa, and what the employer's H-1B and green card record looks like.",
    },
  ];
}

export async function loader(args: Route.LoaderArgs) {
  const userId = await currentUserId(args);
  if (!userId) return { visaStatus: null, jobs: [] };
  return withDb(env.DATABASE_URL, async (db) => ({
    visaStatus: (await getVisaStatus(db, userId)).visaStatus,
    jobs: (await recentJobs(db, userId)).map((j) => ({
      id: j.id,
      label: [j.title, j.company].filter(Boolean).join(" at ") || "Job posting",
      verdict: j.screening
        ? ScreeningReport.shape.verdict.parse(
            (j.screening as { verdict: unknown }).verdict,
          )
        : null,
    })),
  }));
}

export async function action(args: Route.ActionArgs) {
  const userId = await currentUserId(args);
  if (!userId) return { error: "Sign in to screen a job." };
  const form = await args.request.formData();
  const input = ScreenInput.safeParse({ jobText: form.get("jobText") });
  if (!input.success) return { error: input.error.issues[0].message };
  const visa = form.get("visaStatus");
  const visaStatus = VISA_STATUSES.find((v) => v === visa) ?? null;

  return withDb(env.DATABASE_URL, async (db) => {
    const { exists } = await getVisaStatus(db, userId);
    const email = exists ? "" : await currentEmail(args, userId);
    await saveUser(db, userId, email, visaStatus);

    const id = await createJob(db, userId, input.data.jobText);
    if (!id) {
      return {
        error: `You've screened ${DAILY_SCREENINGS} jobs in the last day, the daily limit. Try again tomorrow.`,
      };
    }
    try {
      await screenJob(db, agent(), userId, (await getJob(db, userId, id))!);
    } catch (e) {
      if (!(e instanceof AgentError)) throw e;
      return {
        error: `${e.message} The posting is saved under your recent jobs, so you can screen it again from there.`,
      };
    }
    return redirect(`/jobs/${id}`);
  });
}

const CHECKS =
  "sponsorship and work-authorization wording, ITAR, export control and clearances, contract terms, relocation, and pay against what the employer paid H-1B hires";

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const text = useRef<HTMLTextAreaElement>(null);
  const busy = useNavigation().state === "submitting";

  return (
    <main>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Check a job before you apply
      </h1>

      <Form method="post" className="mt-6">
        <label htmlFor="jobText" className="sr-only">
          Job description
        </label>
        <textarea
          ref={text}
          id="jobText"
          name="jobText"
          required
          minLength={50}
          maxLength={30_000}
          rows={14}
          placeholder="Paste the job description here"
          aria-describedby={actionData?.error ? "screen-error" : undefined}
          className="block w-full resize-y rounded-[var(--radius-sheet)] border border-rule bg-sheet p-4 text-base leading-relaxed placeholder:text-ink-muted focus:border-guilloche sm:p-6"
        />

        <Show when="signed-in">
          <p className="mt-4">
            <label htmlFor="visaStatus">My status:</label>
            <select
              id="visaStatus"
              name="visaStatus"
              defaultValue={loaderData.visaStatus ?? "H1B"}
              className="mx-2 rounded-[var(--radius-field)] border border-rule bg-sheet px-2 py-1 font-semibold text-ink"
            >
              {VISA_STATUSES.map((v) => (
                <option key={v} value={v}>
                  {VISA_LABEL[v]}
                </option>
              ))}
            </select>
          </p>
        </Show>

        {actionData?.error && (
          <p
            id="screen-error"
            role="alert"
            className="mt-4 border-l-4 border-denial pl-3"
          >
            {actionData.error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Show when="signed-in">
            <button
              type="submit"
              disabled={busy}
              className="rounded-[var(--radius-field)] bg-ink px-5 py-2 text-lg font-semibold text-paper hover:bg-guilloche disabled:bg-ink-muted"
            >
              {busy ? "Reading the posting…" : "Screen this job"}
            </button>
            <button
              type="button"
              className="font-semibold underline decoration-guilloche underline-offset-4 hover:decoration-2"
              onClick={() => {
                if (text.current) text.current.value = sample.jobText;
                text.current?.focus();
              }}
            >
              Try a sample posting
            </button>
          </Show>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-[var(--radius-field)] bg-ink px-5 py-2 text-lg font-semibold text-paper hover:bg-guilloche"
              >
                Sign in to screen this job
              </button>
            </SignInButton>
            <Link to="/sample" viewTransition className="font-semibold">
              See a sample report
            </Link>
          </Show>
        </div>
      </Form>

      <p className="measure mt-6 text-ink-muted">
        What gets checked: {CHECKS}. Employer records come from public
        Department of Labor and USCIS data, and you can{" "}
        <Link to="/discover">find employers that sponsor your role</Link>{" "}
        without signing in.
      </p>

      {loaderData.jobs.length > 0 && (
        <section aria-labelledby="recent" className="mt-12">
          <h2 id="recent" className="text-xl font-bold">
            Your recent jobs
          </h2>
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {loaderData.jobs.map((j) => (
              <li
                key={j.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <Link to={`/jobs/${j.id}`} className="font-semibold">
                  {j.label}
                </Link>
                {j.verdict ? (
                  <span
                    className={`shrink-0 rounded-[var(--radius-field)] border-2 px-2 text-sm font-bold ${VERDICT_TAG[j.verdict][1]}`}
                  >
                    {VERDICT_TAG[j.verdict][0]}
                  </span>
                ) : (
                  <span className="text-sm text-ink-muted">Not screened</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
