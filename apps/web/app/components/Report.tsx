import type { ScreenFlag, ScreeningReport } from "@jobfit/shared";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";

import { PayRange } from "~/components/PayRange";
import { VerdictStamp } from "~/components/VerdictStamp";
import { formatCount, formatUsd, plural } from "~/lib/format";

const ORDER: ScreenFlag["severity"][] = ["block", "warn", "info", "positive"];
const SEVERITY_LABEL: Record<ScreenFlag["severity"], string> = {
  block: "Rules you out",
  warn: "Check this",
  info: "Good to know",
  positive: "In your favor",
};
const SOURCE_LABEL: Record<ScreenFlag["source"], string> = {
  rule: "Found by a fixed rule",
  llm: "Found by AI, quoted from the posting",
  data: "From public H-1B data",
};

function Marker({ severity }: { severity: ScreenFlag["severity"] }) {
  const common = "mt-1 size-3.5 shrink-0";
  switch (severity) {
    case "block":
      return (
        <svg aria-hidden viewBox="0 0 14 14" className={common}>
          <rect width="14" height="14" rx="2" fill="var(--denial)" />
        </svg>
      );
    case "warn":
      return (
        <svg aria-hidden viewBox="0 0 14 14" className={common}>
          <path
            d="M7 1 13.5 13H.5Z"
            fill="var(--highlighter)"
            stroke="var(--ink)"
            strokeWidth="1.2"
          />
        </svg>
      );
    case "info":
      return (
        <svg aria-hidden viewBox="0 0 14 14" className={common}>
          <circle
            cx="7"
            cy="7"
            r="6"
            fill="none"
            stroke="var(--ink-muted)"
            strokeWidth="2"
          />
        </svg>
      );
    case "positive":
      return (
        <svg aria-hidden viewBox="0 0 14 14" className={common}>
          <path
            d="M1.5 7.5 5.5 11.5 12.5 2.5"
            fill="none"
            stroke="var(--approval)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

interface Span {
  start: number;
  end: number;
  flag: number;
}

/** Where each flag's evidence sits in the posting; flags from data have no sentence there. */
export function evidenceSpans(text: string, flags: ScreenFlag[]): Span[] {
  const spans: Span[] = [];
  flags.forEach((f, i) => {
    const start = text.indexOf(f.evidence);
    if (
      start < 0 ||
      spans.some((s) => start < s.end && start + f.evidence.length > s.start)
    )
      return;
    spans.push({ start, end: start + f.evidence.length, flag: i });
  });
  return spans.sort((a, b) => a.start - b.start);
}

function Posting({
  text,
  spans,
  active,
}: {
  text: string;
  spans: Span[];
  active: number | null;
}) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  for (const s of spans) {
    parts.push(text.slice(at, s.start));
    parts.push(
      <mark
        key={s.flag}
        id={`evidence-${s.flag}`}
        className={`rounded-[2px] bg-highlighter px-0.5 text-ink transition-[outline] ${active === s.flag ? "outline-2 outline-ink" : ""}`}
      >
        {text.slice(s.start, s.end)}
      </mark>,
    );
    at = s.end;
  }
  parts.push(text.slice(at));
  return <div className="measure whitespace-pre-wrap text-base">{parts}</div>;
}

function EmployerRecord({ report }: { report: ScreeningReport }) {
  const { employer, parsed } = report;
  if (!employer.matched) {
    return (
      <p>
        We couldn't match {employer.employer ?? "this employer"} to public H-1B
        records. Search for it on the{" "}
        <Link
          to={`/employers?q=${encodeURIComponent(employer.employer ?? "")}`}
        >
          employers page
        </Link>{" "}
        or ask the recruiter about its sponsorship history.
      </p>
    );
  }
  const latest = employer.years.at(-1);
  const band = employer.wage_band;
  const posted = parsed?.pay_max ?? parsed?.pay_min ?? null;
  const postedYearly =
    posted && parsed?.pay_unit === "hour" ? posted * 2080 : posted;
  const likelihood = {
    high: "Transfers in this role are common here.",
    medium: "It has taken some transfers, but few in this role.",
    low: "It has filed few or no H-1Bs recently.",
    unknown: "",
  }[employer.transfer_likelihood];
  return (
    <div className="space-y-4">
      {latest && (
        <p className="measure">
          {employer.employer_id ? (
            <Link
              to={`/employers/${employer.employer_id}`}
              viewTransition
              className="font-semibold"
            >
              {employer.employer}
            </Link>
          ) : (
            <span className="font-semibold">{employer.employer}</span>
          )}{" "}
          had {plural(latest.lca_certified, "certified H-1B filing")} in FY
          {latest.fiscal_year},
          {latest.transfers
            ? `including ${plural(latest.transfers, "transfer")}`
            : "none of them transfers"}
          {latest.perm_certified !== null &&
            `, and ${formatCount(latest.perm_certified)} certified green card applications`}
          . {likelihood}
        </p>
      )}
      {band && (
        <div className="measure">
          <p className="text-sm text-ink-muted">
            What it paid H-1B {band.title_bucket} hires
            {band.worksite_state ? ` in ${band.worksite_state}` : ""}:{" "}
            {formatUsd(band.p25)} to {formatUsd(band.p75)}, median{" "}
            {formatUsd(band.median)}
            {postedYearly
              ? `. This posting tops out at ${formatUsd(postedYearly)}.`
              : "."}
          </p>
          <div className="mt-2">
            <PayRange
              p25={band.p25}
              median={band.median}
              p75={band.p75}
              min={Math.min(band.p25, postedYearly ?? band.p25) * 0.9}
              max={Math.max(band.p75, postedYearly ?? band.p75) * 1.1}
              marker={postedYearly ?? undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function Report({
  report,
  jobText,
}: {
  report: ScreeningReport;
  jobText: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const still = useReducedMotion();
  const flags = [...report.flags].sort(
    (a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity),
  );
  const spans = evidenceSpans(jobText, flags);
  const title = report.parsed?.title ?? "Job posting";
  const company = report.parsed?.company ?? report.employer.employer;

  return (
    <article>
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-lg text-ink-muted">
          {[company, report.parsed?.location].filter(Boolean).join(" · ")}
        </p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-label="Verdict" className="lg:order-last">
          <VerdictStamp verdict={report.verdict} />
          <p className="mt-4">{report.summary}</p>
          <LazyMotion features={domAnimation} strict>
            <ul className="mt-6 space-y-4" aria-label="Flags">
              {flags.map((f, i) => (
                <m.li
                  key={f.code}
                  className="flex gap-3"
                  initial={still ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 + i * 0.08 }}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                >
                  <Marker severity={f.severity} />
                  <div>
                    <p className="text-sm font-semibold">
                      {SEVERITY_LABEL[f.severity]}
                    </p>
                    <p>{f.explanation}</p>
                    {spans.some((s) => s.flag === i) ? (
                      <a
                        href={`#evidence-${i}`}
                        className="mt-1 block text-sm"
                        onFocus={() => setActive(i)}
                        onBlur={() => setActive(null)}
                      >
                        <q>{f.evidence}</q>
                      </a>
                    ) : (
                      f.source !== "data" && (
                        <q className="mt-1 block text-sm">{f.evidence}</q>
                      )
                    )}
                    <p className="mt-1 text-sm text-ink-muted">
                      {SOURCE_LABEL[f.source]}
                    </p>
                  </div>
                </m.li>
              ))}
            </ul>
          </LazyMotion>
        </section>

        <section
          aria-label="The posting"
          className="rounded-[var(--radius-sheet)] bg-sheet p-4 sm:p-6"
        >
          <h2 className="text-sm font-semibold text-ink-muted">
            The posting, with flagged sentences highlighted
          </h2>
          <div className="mt-3">
            <Posting text={jobText} spans={spans} active={active} />
          </div>
        </section>
      </div>

      <section aria-labelledby="record" className="mt-12">
        <h2 id="record" className="text-xl font-bold">
          {report.employer.employer
            ? `${report.employer.employer}'s H-1B record`
            : "Employer's H-1B record"}
        </h2>
        <div className="mt-3">
          <EmployerRecord report={report} />
        </div>
      </section>

      <p className="mt-10 font-semibold">{report.disclaimer}</p>
    </article>
  );
}
