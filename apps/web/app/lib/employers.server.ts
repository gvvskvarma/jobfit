import type { DiscoverQuery } from "@jobfit/shared";

import type { Db } from "./db.server";

export interface EmployerHit {
  id: string;
  name: string;
  capExemptHint: boolean;
  fiscalYear: number | null;
  lcaCertified: number | null;
  transfers: number | null;
}

export interface YearStats {
  fiscalYear: number;
  lcaCertified: number;
  lcaTotal: number;
  transfers: number;
  newEmployment: number;
  h1bDependent: boolean;
  willfulViolator: boolean;
  uscisInitialApprovals: number | null;
  uscisInitialDenials: number | null;
  uscisContinuingApprovals: number | null;
  uscisContinuingDenials: number | null;
  permTotal: number | null;
  permCertified: number | null;
}

export interface WageBandRow {
  socCode: string;
  titleBucket: string;
  worksiteState: string;
  n: number;
  transfers: number;
  p25: number;
  median: number;
  p75: number;
}

export interface DatasetCredit {
  source: string;
  fiscalYear: number;
  sourceUrl: string;
  loadedAt: Date;
}

export interface EmployerDetail {
  id: string;
  name: string;
  naics: string | null;
  capExemptHint: boolean;
  years: YearStats[];
  wageBands: WageBandRow[];
  datasets: DatasetCredit[];
}

export interface SponsorRow {
  id: string;
  name: string;
  capExemptHint: boolean;
  certified: number;
  transfers: number;
  permCertified: number | null;
  /** Median pay of the employer's largest matching LCA group; null when n < 5. */
  medianPay: number | null;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// ponytail: ILIKE scan over ~100k employers is a few ms; add a pg_trgm index if it isn't.
export async function searchEmployers(
  db: Db,
  q: string,
  limit = 20,
): Promise<EmployerHit[]> {
  const { rows } = await db.query<EmployerHit>(
    `SELECT e.id, e."displayName" AS name, e."capExemptHint",
            s."fiscalYear", s."lcaCertified", s."changeEmployer" AS transfers
       FROM "Employer" e
       LEFT JOIN LATERAL (
         SELECT "fiscalYear", "lcaCertified", "changeEmployer" FROM "EmployerYearStats"
          WHERE "employerId" = e.id ORDER BY "fiscalYear" DESC LIMIT 1
       ) s ON true
      WHERE e."displayName" ILIKE $1 OR e."normalizedName" ILIKE $1
      ORDER BY s."lcaCertified" DESC NULLS LAST, e."displayName"
      LIMIT $2`,
    [`%${escapeLike(q)}%`, limit],
  );
  return rows;
}

export async function getEmployer(
  db: Db,
  id: string,
): Promise<EmployerDetail | null> {
  const employer = await db.query<
    Omit<EmployerDetail, "years" | "wageBands" | "datasets">
  >(
    `SELECT id, "displayName" AS name, naics, "capExemptHint" FROM "Employer" WHERE id = $1`,
    [id],
  );
  if (!employer.rows[0]) return null;

  const years = await db.query<YearStats>(
    `SELECT "fiscalYear", "lcaCertified", "lcaTotal", "changeEmployer" AS transfers,
            "newEmployment", "h1bDependent", "willfulViolator", "uscisInitialApprovals",
            "uscisInitialDenials", "uscisContinuingApprovals", "uscisContinuingDenials",
            "permTotal", "permCertified"
       FROM "EmployerYearStats" WHERE "employerId" = $1 ORDER BY "fiscalYear"`,
    [id],
  );
  const latest = years.rows.at(-1)?.fiscalYear;
  const wageBands = latest
    ? await db.query<WageBandRow>(
        `SELECT "socCode", "titleBucket", "worksiteState", n, "changeEmployer" AS transfers,
                p25, median, p75
           FROM "WageBand"
          WHERE "employerId" = $1 AND "fiscalYear" = $2 AND median IS NOT NULL
          ORDER BY n DESC LIMIT 50`,
        [id, latest],
      )
    : { rows: [] };
  const datasets = await db.query<DatasetCredit>(
    `SELECT source, "fiscalYear", "sourceUrl", "loadedAt" FROM "DatasetVersion"
      ORDER BY "fiscalYear" DESC, source`,
  );
  return {
    ...employer.rows[0],
    years: years.rows,
    wageBands: wageBands.rows,
    datasets: datasets.rows,
  };
}

export async function latestFiscalYear(db: Db): Promise<number | null> {
  const { rows } = await db.query<{ fy: number | null }>(
    `SELECT max("fiscalYear") AS fy FROM "DatasetVersion" WHERE source = 'LCA'`,
  );
  return rows[0]?.fy ?? null;
}

/** Employers ranked by certified LCAs, then transfers, then PERM (SPEC 8.3 discover_sponsors). */
export async function discoverSponsors(
  db: Db,
  { bucket, state, fy, limit }: DiscoverQuery & { fy: number },
): Promise<SponsorRow[]> {
  const { rows } = await db.query<SponsorRow>(
    `WITH cells AS (
       SELECT "employerId", n, "changeEmployer", median,
              row_number() OVER (PARTITION BY "employerId" ORDER BY n DESC, median IS NULL) AS rk
         FROM "WageBand"
        WHERE "titleBucket" = $1 AND "fiscalYear" = $2 AND ($3::text IS NULL OR "worksiteState" = $3)
     )
     SELECT e.id, e."displayName" AS name, e."capExemptHint",
            sum(c.n)::int AS certified, sum(c."changeEmployer")::int AS transfers,
            s."permCertified", max(c.median) FILTER (WHERE c.rk = 1) AS "medianPay"
       FROM cells c
       JOIN "Employer" e ON e.id = c."employerId"
       LEFT JOIN "EmployerYearStats" s ON s."employerId" = e.id AND s."fiscalYear" = $2
      GROUP BY e.id, s."permCertified"
      ORDER BY certified DESC, transfers DESC, s."permCertified" DESC NULLS LAST, e."displayName"
      LIMIT $4`,
    [bucket, fy, state ?? null, limit],
  );
  return rows;
}
