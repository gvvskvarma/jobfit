import type { ScreenFlag, ScreeningReport } from "@jobfit/shared";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";

import { PayRange } from "~/components/PayRange";
import { Meta, Panel, button } from "~/components/ui";
import { VerdictStamp } from "~/components/VerdictStamp";
import { formatCount, formatUsd, plural } from "~/lib/format";

const ORDER: ScreenFlag["severity"][] = ["block", "warn", "info", "positive"];
const SEVERITY: Record<
  ScreenFlag["severity"],
  { glyph: string; label: string; className: string }
> = {
  block: { glyph: "✗", label: "Rules you out", className: "text-denial" },
  warn: { glyph: "!", label: "Check this", className: "text-caution" },
  info: { glyph: "·", label: "Good to know", className: "text-ink-muted" },
  positive: { glyph: "✓", label: "In your favor", className: "text-approval" },
};
const SOURCE_LABEL: Record<ScreenFlag["source"], string> = {
  rule: "found by a fixed rule",
  llm: "found by AI, quoted from the posting",
  data: "from public H-1B data",
};

// The report prints after the verdict finishes typing.
const PRINT_START = 0.7;
const LINE_GAP = 0.09;

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
        className={`rounded-[2px] bg-highlighter px-0.5 text-ink transition-[box-shadow] ${active === s.flag ? "shadow-[0_0_0_2px_var(--accent)]" : ""}`}
      >
        {text.slice(s.start, s.end)}
      </mark>,
    );
    at = s.end;
  }
  parts.push(text.slice(at));
  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed">{parts}</div>
  );
}

function EmployerRecord({ report }: { report: ScreeningReport }) {
  const { employer, parsed } = report;
  const name = employer.employer ?? "this employer";
  if (!employer.matched) {
    return (
      <div className="space-y-2">
        <p>
          <span className="text-caution">!</span> No H-1B filings found under
          the name <strong>{name}</strong> in the Department of Labor data
          JobFit has loaded.
        </p>
        <p className="text-ink-muted">
          Employers that sponsor usually file every year, so treat this as a
          reason to ask the recruiter about sponsorship before you apply. If the
          company files under a different legal name,{" "}
          <Link
            to={`/employers?q=${encodeURIComponent(employer.employer ?? "")}`}
          >
            search the employer records
          </Link>
          .
        </p>
      </div>
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
    <div className="space-y-5">
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
          {latest.fiscal_year},{" "}
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
  jobUrl,
  screenedOn,
}: {
  report: ScreeningReport;
  jobText: string;
  jobUrl?: string | null;
  screenedOn?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const still = useReducedMotion();
  const flags = [...report.flags].sort(
    (a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity),
  );
  const spans = evidenceSpans(jobText, flags);
  const title = report.parsed?.title ?? "Job posting";
  const meta = [
    report.parsed?.company ?? report.employer.employer,
    report.parsed?.location,
    screenedOn && `screened ${screenedOn}`,
  ].filter(Boolean);
  const line = (i: number) =>
    still
      ? {}
      : {
          initial: { opacity: 0, x: -6 },
          animate: { opacity: 1, x: 0 },
          transition: { delay: PRINT_START + i * LINE_GAP, duration: 0.25 },
        };

  return (
    <LazyMotion features={domAnimation} strict>
      <article className="space-y-10">
        <header className="space-y-3">
          <h1 className="text-2xl font-bold sm:text-3xl">
            <span aria-hidden className="mr-3 text-pink">
              ●
            </span>
            {title}
          </h1>
          {meta.length > 0 && <Meta>{meta.join(" · ")}</Meta>}
          {jobUrl && (
            <p className="pt-2">
              <a
                href={jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={button}
              >
                <span aria-hidden>◼</span> Open the posting to apply
                <span aria-hidden>↗</span>
              </a>
            </p>
          )}
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <Panel title="verdict" className="self-start lg:order-last">
            <VerdictStamp verdict={report.verdict} />
            <m.p className="mt-4" {...line(0)}>
              {report.summary}
            </m.p>
            <ul className="mt-6 space-y-5" aria-label="Flags">
              {flags.map((f, i) => {
                const sev = SEVERITY[f.severity];
                const linked = spans.some((s) => s.flag === i);
                return (
                  <m.li
                    key={f.code}
                    className="grid grid-cols-[1.25rem_minmax(0,1fr)]"
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    {...line(i + 1)}
                  >
                    <span aria-hidden className={`font-bold ${sev.className}`}>
                      {sev.glyph}
                    </span>
                    <div>
                      <p className={`text-sm font-semibold ${sev.className}`}>
                        {sev.label}
                      </p>
                      <p>{f.explanation}</p>
                      {f.source !== "data" && (
                        <blockquote className="mt-1.5 border-l-2 border-rule pl-3 text-sm text-ink-muted">
                          {linked ? (
                            <a
                              href={`#evidence-${i}`}
                              className="text-ink-muted"
                              onFocus={() => setActive(i)}
                              onBlur={() => setActive(null)}
                            >
                              “{f.evidence}”
                            </a>
                          ) : (
                            <>“{f.evidence}”</>
                          )}
                        </blockquote>
                      )}
                      <p className="mt-1 text-xs text-ink-muted">
                        <span aria-hidden>⎿ </span>
                        {SOURCE_LABEL[f.source]}
                      </p>
                    </div>
                  </m.li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="posting, flagged lines highlighted">
            <Posting text={jobText} spans={spans} active={active} />
          </Panel>
        </div>

        <Panel
          title={
            report.employer.employer
              ? `${report.employer.employer}'s h-1b record`
              : "employer's h-1b record"
          }
        >
          <EmployerRecord report={report} />
        </Panel>

        <p className="font-semibold">{report.disclaimer}</p>
      </article>
    </LazyMotion>
  );
}
