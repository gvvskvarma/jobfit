import { Show, SignInButton } from "@clerk/react-router";
import { ScreenInput, ScreeningReport, VISA_STATUSES } from "@jobfit/shared";
import { env } from "cloudflare:workers";
import { useRef } from "react";
import { Form, Link, redirect, useNavigation } from "react-router";

import { Cursor, Wordmark, Working } from "~/components/terminal";
import {
  Hints,
  Meta,
  Panel,
  VerdictTag,
  button,
  field,
  quietButton,
} from "~/components/ui";
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

const VISA_LABEL: Record<VisaStatus, string> = {
  H1B: "H-1B",
  OPT: "OPT",
  STEM_OPT: "STEM OPT",
  L1: "L-1",
  GC_PENDING: "Green card pending",
  CITIZEN_OR_GC: "US citizen or green card holder",
  OTHER: "Something else",
};

const STEPS = [
  "Reading the posting",
  "Checking sponsorship and work-authorization wording",
  "Checking ITAR, export control and clearances",
  "Looking up the employer's H-1B record",
  "Comparing pay with what it paid H-1B hires",
];

const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

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
      title: j.title ?? "Job posting",
      company: j.company,
      date: day.format(j.createdAt),
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
  const input = ScreenInput.safeParse({
    jobText: form.get("jobText"),
    jobUrl: form.get("jobUrl") ?? "",
  });
  if (!input.success) return { error: input.error.issues[0].message };
  const visa = form.get("visaStatus");
  const visaStatus = VISA_STATUSES.find((v) => v === visa) ?? null;

  return withDb(env.DATABASE_URL, async (db) => {
    const { exists } = await getVisaStatus(db, userId);
    const email = exists ? "" : await currentEmail(args, userId);
    await saveUser(db, userId, email, visaStatus);

    const id = await createJob(
      db,
      userId,
      input.data.jobText,
      input.data.jobUrl,
    );
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

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const form = useRef<HTMLFormElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const busy = useNavigation().state === "submitting";

  return (
    <main className="space-y-10">
      <header className="space-y-4">
        <Wordmark />
        <p className="measure text-lg">
          Check a job before you apply.{" "}
          <span className="text-ink-muted">
            Paste a posting and JobFit reads it for sponsorship, ITAR and
            contract terms, then pulls the employer's real H-1B and green card
            record.
          </span>
        </p>
      </header>

      <Form ref={form} method="post" className="space-y-4">
        <Panel
          title={
            <>
              <span className="text-pink">›</span> paste the job posting
              {!busy && <Cursor />}
            </>
          }
          className="focus-within:border-accent focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
        >
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
            rows={12}
            placeholder="About the job…"
            aria-describedby={actionData?.error ? "screen-error" : undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                form.current?.requestSubmit();
              }
              if (e.key === "Escape") e.currentTarget.value = "";
            }}
            className="block w-full resize-y bg-transparent leading-relaxed placeholder:text-ink-muted focus:outline-none"
          />
        </Panel>

        <Show when="signed-in">
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <label className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md">
              <span className="shrink-0 text-ink-muted">job link</span>
              <input
                type="url"
                name="jobUrl"
                placeholder="https://… (optional, for the apply button)"
                className={`${field} min-w-0 flex-1`}
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-ink-muted">my status</span>
              <select
                name="visaStatus"
                defaultValue={loaderData.visaStatus ?? "H1B"}
                className={`${field} font-semibold`}
              >
                {VISA_STATUSES.map((v) => (
                  <option key={v} value={v}>
                    {VISA_LABEL[v]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Show>

        {actionData?.error && (
          <p
            id="screen-error"
            role="alert"
            className="border-l-2 border-denial pl-3 text-denial"
          >
            ✗ {actionData.error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Show when="signed-in">
            <button type="submit" disabled={busy} className={button}>
              <span aria-hidden>◼</span> Screen this job
            </button>
            <button
              type="button"
              className={quietButton}
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
              <button type="button" className={button}>
                <span aria-hidden>◼</span> Sign in to screen this job
              </button>
            </SignInButton>
            <Link to="/sample" viewTransition className={quietButton}>
              See a sample report
            </Link>
          </Show>
        </div>

        {busy ? (
          <Working steps={STEPS} />
        ) : (
          <Hints
            items={[
              "⌘↵ to screen",
              "Esc to clear",
              `${DAILY_SCREENINGS} screenings a day`,
            ]}
          />
        )}
      </Form>

      <Meta>
        Checks sponsorship and work-authorization wording, ITAR, export control
        and clearances, contract terms, relocation, and pay against what the
        employer paid H-1B hires. No sign-in needed to{" "}
        <Link to="/discover">find employers that sponsor your role</Link>.
      </Meta>

      {loaderData.jobs.length > 0 && (
        <Panel title="recent jobs">
          <ul className="-mx-2">
            {loaderData.jobs.map((j) => (
              <li key={j.id}>
                <Link
                  to={`/jobs/${j.id}`}
                  viewTransition
                  className="group flex items-center gap-3 rounded-[2px] px-2 py-1.5 text-ink no-underline transition-colors hover:bg-select"
                >
                  <span
                    aria-hidden
                    className="text-pink opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    ›
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold">{j.title}</span>
                    {j.company && (
                      <span className="text-ink-muted"> at {j.company}</span>
                    )}
                  </span>
                  {j.verdict ? (
                    <VerdictTag verdict={j.verdict} />
                  ) : (
                    <span className="shrink-0 text-xs text-ink-muted">
                      not screened
                    </span>
                  )}
                  <span className="hidden w-14 shrink-0 text-right text-xs text-ink-muted sm:block">
                    {j.date}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </main>
  );
}
