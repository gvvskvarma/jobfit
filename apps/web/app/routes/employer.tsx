import { env } from "cloudflare:workers";
import { data } from "react-router";

import { FilingsChart } from "~/components/FilingsChart";
import { PayRange } from "~/components/PayRange";
import { withDb } from "~/lib/db.server";
import { getEmployer, type YearStats } from "~/lib/employers.server";
import { bucketLabel, formatCount, formatUsd } from "~/lib/format";
import { US_STATES } from "~/lib/states";

import type { Route } from "./+types/employer";

export async function loader({ params }: Route.LoaderArgs) {
  const employer = await withDb(env.DATABASE_URL, (db) =>
    getEmployer(db, params.id),
  );
  if (!employer) throw data("No employer with that id.", { status: 404 });
  return { employer };
}

export function meta({ loaderData }: Route.MetaArgs) {
  const name = loaderData?.employer.name ?? "Employer";
  return [
    { title: `${name}: H-1B and green card record · JobFit` },
    {
      name: "description",
      content: `H-1B filings, transfers, green card (PERM) filings and pay for ${name}, from public DOL and USCIS data.`,
    },
  ];
}

function Summary({ name, year }: { name: string; year: YearStats }) {
  const b = (n: number) => (
    <strong className="tabular font-semibold">{formatCount(n)}</strong>
  );
  return (
    <p className="measure text-lg">
      In FY{year.fiscalYear}, {name} had {b(year.lcaCertified)} certified H-1B
      labor condition applications. {b(year.transfers)} of those were for
      workers transferring from another employer
      {year.permCertified !== null ? (
        <>
          , and it had {b(year.permCertified)} certified green card (PERM)
          applications.
        </>
      ) : (
        <>. It had no green card (PERM) applications on file that year.</>
      )}
    </p>
  );
}

function Notices({
  year,
  capExemptHint,
}: {
  year: YearStats;
  capExemptHint: boolean;
}) {
  const notices = [
    capExemptHint && {
      tone: "border-approval",
      text: "May be cap-exempt, because it looks like a university or research institute. Cap-exempt employers can file H-1Bs outside the lottery. Confirm with the employer.",
    },
    year.h1bDependent && {
      tone: "border-caution",
      text: "Files as H-1B dependent: a large share of its workforce is on H-1B, which adds recruiting rules for some new hires.",
    },
    year.willfulViolator && {
      tone: "border-denial",
      text: "The Department of Labor has found this employer to be a willful violator of H-1B rules.",
    },
  ].filter(Boolean) as { tone: string; text: string }[];
  if (!notices.length) return null;
  return (
    <ul className="measure mt-6 space-y-2">
      {notices.map((n) => (
        <li key={n.text} className={`border-l-4 ${n.tone} bg-sheet px-4 py-2`}>
          {n.text}
        </li>
      ))}
    </ul>
  );
}

function YearTable({ years }: { years: YearStats[] }) {
  const cell = (n: number | null) => (n === null ? "–" : formatCount(n));
  // USCIS stopped publishing yearly files after FY2023; skip the column when it's all empty.
  const uscis = years.some((y) => y.uscisInitialApprovals !== null);
  return (
    <table className="tabular w-full text-left text-sm">
      <caption className="sr-only">
        H-1B and green card filings by fiscal year
      </caption>
      <thead className="text-ink-muted">
        <tr className="border-b border-rule">
          <th className="py-2 pr-4 font-normal">Fiscal year</th>
          <th className="py-2 pr-4 text-right font-normal">Certified H-1B</th>
          <th className="py-2 pr-4 text-right font-normal">Transfers</th>
          <th className="py-2 pr-4 text-right font-normal">New hires</th>
          <th className="py-2 pr-4 text-right font-normal">
            Green card certified
          </th>
          {uscis && (
            <th className="py-2 text-right font-normal">
              USCIS approvals (new / continuing)
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {[...years].reverse().map((y) => (
          <tr key={y.fiscalYear} className="border-b border-rule last:border-0">
            <td className="py-2 pr-4">FY{y.fiscalYear}</td>
            <td className="py-2 pr-4 text-right">{cell(y.lcaCertified)}</td>
            <td className="py-2 pr-4 text-right">{cell(y.transfers)}</td>
            <td className="py-2 pr-4 text-right">{cell(y.newEmployment)}</td>
            <td className="py-2 pr-4 text-right">{cell(y.permCertified)}</td>
            {uscis && (
              <td className="py-2 text-right">
                {y.uscisInitialApprovals === null
                  ? "–"
                  : `${cell(y.uscisInitialApprovals)} / ${cell(y.uscisContinuingApprovals)}`}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Employer({
  loaderData: { employer },
}: Route.ComponentProps) {
  const latest = employer.years.at(-1);
  const bands = employer.wageBands;
  const min = Math.min(...bands.map((b) => b.p25));
  const max = Math.max(...bands.map((b) => b.p75));

  return (
    <main>
      <h1
        className="text-2xl font-bold sm:text-3xl"
        style={{ viewTransitionName: `employer-${employer.id}` }}
      >
        <span aria-hidden className="mr-3 text-pink">
          ●
        </span>
        {employer.name}
      </h1>
      {latest ? (
        <>
          <div className="mt-6">
            <Summary name={employer.name} year={latest} />
          </div>
          <Notices year={latest} capExemptHint={employer.capExemptHint} />
        </>
      ) : (
        <p className="mt-6">
          No H-1B filings are loaded for this employer yet.
        </p>
      )}

      <section
        className="mt-12 rounded-[var(--radius-sheet)] border border-rule p-4 sm:p-6"
        aria-labelledby="history"
      >
        <h2 id="history" className="text-xl font-bold">
          Filings by year
        </h2>
        <div className="mt-4">
          {employer.years.length >= 2 ? (
            <FilingsChart years={employer.years} />
          ) : (
            <p className="text-sm text-ink-muted">
              The year-by-year chart appears once more than one fiscal year is
              loaded.
            </p>
          )}
        </div>
        <div className="mt-6 overflow-x-auto">
          <YearTable years={employer.years} />
        </div>
        <p className="measure mt-4 text-sm text-ink-muted">
          A labor condition application is filed before an H-1B petition, so it
          shows intent to hire, not an approval. Transfers are workers joining
          from another employer on an existing H-1B. Staffing firms file in
          large volumes.
        </p>
      </section>

      <section className="mt-12" aria-labelledby="pay">
        <h2 id="pay" className="text-xl font-bold">
          What it paid H-1B workers in FY{latest?.fiscalYear}
        </h2>
        {bands.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="tabular w-full text-left text-sm">
              <caption className="sr-only">
                Annual pay on certified H-1B filings by role and state
              </caption>
              <thead className="text-ink-muted">
                <tr className="border-b border-rule">
                  <th className="py-2 pr-4 font-normal">Role</th>
                  <th className="hidden py-2 pr-4 font-normal sm:table-cell">
                    State
                  </th>
                  <th className="py-2 pr-4 text-right font-normal">Filings</th>
                  <th className="w-1/3 py-2 pr-4 font-normal">
                    Middle half of pay{" "}
                    <span className="sr-only">(25th to 75th percentile)</span>
                  </th>
                  <th className="py-2 text-right font-normal">Median</th>
                </tr>
              </thead>
              <tbody>
                {bands.map((b) => (
                  <tr
                    key={`${b.socCode}-${b.titleBucket}-${b.worksiteState}`}
                    className="border-b border-rule"
                  >
                    <td className="py-2 pr-4">
                      {bucketLabel(b.titleBucket)}
                      <span className="block text-ink-muted sm:hidden">
                        {US_STATES[b.worksiteState] ?? b.worksiteState}
                      </span>
                      <span className="block text-ink-muted">
                        SOC {b.socCode}
                      </span>
                    </td>
                    <td className="hidden py-2 pr-4 sm:table-cell">
                      {US_STATES[b.worksiteState] ?? b.worksiteState}
                    </td>
                    <td className="py-2 pr-4 text-right">{formatCount(b.n)}</td>
                    <td className="py-2 pr-4">
                      <PayRange
                        p25={b.p25}
                        median={b.median}
                        p75={b.p75}
                        min={min}
                        max={max}
                      />
                    </td>
                    <td className="py-2 text-right font-semibold">
                      {formatUsd(b.median)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4">
            No role and state had at least five filings with pay, so no ranges
            are shown.
          </p>
        )}
        <p className="measure mt-4 text-sm text-ink-muted">
          Pay is the offered wage on certified filings, converted to a yearly
          amount. Ranges need at least five filings; wages under $30,000 or over
          $1,000,000 a year are left out.
        </p>
      </section>

      <section
        className="mt-12 text-sm text-ink-muted"
        aria-labelledby="sources"
      >
        <h2 id="sources" className="font-semibold text-ink">
          Data sources
        </h2>
        <ul className="mt-2 space-y-1">
          {employer.datasets.map((d) => (
            <li key={`${d.source}-${d.fiscalYear}`}>
              {d.source === "USCIS"
                ? "USCIS H-1B Employer Data Hub"
                : `DOL ${d.source} disclosure data`}
              , FY
              {d.fiscalYear}, loaded{" "}
              {new Date(d.loadedAt).toLocaleDateString("en-US", {
                dateStyle: "medium",
              })}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
