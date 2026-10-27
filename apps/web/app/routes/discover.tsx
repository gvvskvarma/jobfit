import { DiscoverQuery, TITLE_BUCKETS } from "@jobfit/shared";
import { env } from "cloudflare:workers";
import { Form, Link } from "react-router";

import { withDb } from "~/lib/db.server";
import { discoverSponsors, latestFiscalYear } from "~/lib/employers.server";
import { bucketLabel, formatCount, formatUsd, plural } from "~/lib/format";
import { US_STATES } from "~/lib/states";
import { button, field } from "~/components/ui";

import type { Route } from "./+types/discover";

export function meta() {
  return [
    { title: "Find employers that sponsor H-1Bs · JobFit" },
    {
      name: "description",
      content:
        "Employers ranked by certified H-1B filings for your role and state, from public DOL data.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = DiscoverQuery.safeParse({
    bucket: "software engineer",
    ...params,
  });
  const query = parsed.success
    ? parsed.data
    : DiscoverQuery.parse({ bucket: "software engineer" });
  return withDb(env.DATABASE_URL, async (db) => {
    const latest = await latestFiscalYear(db);
    const years = (
      await db.query<{ fy: number }>(
        `SELECT DISTINCT "fiscalYear" AS fy FROM "DatasetVersion" WHERE source = 'LCA' ORDER BY 1 DESC`,
      )
    ).rows.map((r) => r.fy);
    const fy = query.fy && years.includes(query.fy) ? query.fy : latest;
    const employers = fy ? await discoverSponsors(db, { ...query, fy }) : [];
    return {
      query: { ...query, fy },
      years,
      employers,
      invalid: !parsed.success,
    };
  });
}

const select = `mx-1 ${field} font-semibold`;

export default function Discover({ loaderData }: Route.ComponentProps) {
  const { query, years, employers, invalid } = loaderData;
  const where = query.state
    ? (US_STATES[query.state] ?? query.state)
    : "any state";

  return (
    <main>
      <h1 className="text-2xl font-bold sm:text-3xl">
        <span aria-hidden className="mr-3 text-pink">
          ●
        </span>
        Find employers that sponsor H-1Bs
      </h1>
      <Form method="get" className="measure mt-6 text-lg leading-loose">
        Employers that filed H-1Bs for
        <select
          name="bucket"
          defaultValue={query.bucket}
          className={select}
          aria-label="Role"
        >
          {TITLE_BUCKETS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        roles in
        <select
          name="state"
          defaultValue={query.state ?? ""}
          className={select}
          aria-label="State"
        >
          <option value="">any state</option>
          {Object.entries(US_STATES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        in
        <select
          name="fy"
          defaultValue={query.fy ?? ""}
          className={select}
          aria-label="Fiscal year"
        >
          {years.map((fy) => (
            <option key={fy} value={fy}>
              FY{fy}
            </option>
          ))}
        </select>
        <button type="submit" className={`ml-2 ${button}`}>
          Show employers
        </button>
      </Form>
      {["frontend", "backend", "full stack", "mobile"].includes(
        query.bucket,
      ) && (
        <p className="measure mt-4 text-sm text-ink-muted">
          Roles are grouped by the job title on each filing, and many employers
          file {query.bucket} engineers as “Software Engineer”. Check the
          software engineer roles too.
        </p>
      )}
      {invalid && (
        <p className="mt-4 text-sm text-denial">
          Some filters in the address weren't valid, so the defaults are shown
          instead.
        </p>
      )}

      {query.fy === null ? (
        <p className="mt-10">No H-1B data is loaded yet.</p>
      ) : employers.length === 0 ? (
        <p className="mt-10">
          No employers filed H-1Bs for {query.bucket} roles in {where} in FY
          {query.fy}. Try another state or role.
        </p>
      ) : (
        <div className="mt-10 overflow-x-auto">
          <table className="tabular w-full text-left">
            <caption className="mb-3 text-left text-sm text-ink-muted">
              {bucketLabel(query.bucket)} roles in {where}, FY{query.fy}. Ranked
              by certified filings, then transfers, then green card filings.
            </caption>
            <thead className="text-sm text-ink-muted">
              <tr className="border-b border-rule">
                <th className="py-2 pr-4 font-normal">Employer</th>
                <th className="py-2 pr-4 text-right font-normal">
                  Certified H-1B
                </th>
                <th className="hidden sm:table-cell py-2 pr-4 text-right font-normal">
                  Transfers
                </th>
                <th className="hidden sm:table-cell py-2 pr-4 text-right font-normal">
                  Green card certified
                </th>
                <th className="hidden sm:table-cell py-2 text-right font-normal">
                  Median pay
                </th>
              </tr>
            </thead>
            <tbody>
              {employers.map((e) => (
                <tr key={e.id} className="border-b border-rule">
                  <td className="py-2 pr-4">
                    <Link
                      to={`/employers/${e.id}`}
                      viewTransition
                      className="font-semibold"
                      style={{ viewTransitionName: `employer-${e.id}` }}
                    >
                      {e.name}
                    </Link>
                    {e.capExemptHint && (
                      <span className="block text-sm text-ink-muted">
                        May be cap-exempt
                      </span>
                    )}
                    <span className="block text-sm text-ink-muted sm:hidden">
                      {plural(e.transfers, "transfer")}
                      {e.permCertified !== null &&
                        `, ${formatCount(e.permCertified)} green card`}
                      {e.medianPay !== null &&
                        `, ${formatUsd(e.medianPay)} median`}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {formatCount(e.certified)}
                  </td>
                  <td className="hidden sm:table-cell py-2 pr-4 text-right">
                    {formatCount(e.transfers)}
                  </td>
                  <td className="hidden sm:table-cell py-2 pr-4 text-right">
                    {e.permCertified === null
                      ? "–"
                      : formatCount(e.permCertified)}
                  </td>
                  <td className="hidden sm:table-cell py-2 text-right">
                    {e.medianPay === null ? "–" : formatUsd(e.medianPay)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="measure mt-4 text-sm text-ink-muted">
            Median pay comes from the employer's largest group of matching
            filings, and is shown when that group has at least five.
          </p>
        </div>
      )}
    </main>
  );
}
