import { DiscoverQuery } from "@jobfit/shared";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  discoverSponsors,
  getEmployer,
  searchEmployers,
} from "./employers.server";

const FY = 1999; // never used by real data
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("employer queries", () => {
  const db = new pg.Client({ connectionString: url });
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await db.connect();
    for (const [key, name, capExempt] of [
      ["big", "ZZTEST BIGCO", false],
      ["small", "ZZTEST SMALLCO", false],
      ["uni", "ZZTEST STATE UNIVERSITY", true],
    ] as const) {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO "Employer" ("normalizedName", "displayName", aliases, "capExemptHint")
         VALUES ($1, $2, '{}', $3) RETURNING id`,
        [name, `${name} Inc.`, capExempt],
      );
      ids[key] = rows[0].id;
    }
    const stats = [
      [ids.big, 120, 40, 30],
      [ids.small, 12, 1, null],
      [ids.uni, 12, 5, 2],
    ];
    for (const [id, certified, transfers, perm] of stats) {
      await db.query(
        `INSERT INTO "EmployerYearStats" ("employerId", "fiscalYear", "lcaCertified", "lcaTotal",
           "changeEmployer", "newEmployment", "h1bDependent", "willfulViolator", "permCertified")
         VALUES ($1, $2, $3, $3, $4, 0, false, false, $5)`,
        [id, FY, certified, transfers, perm],
      );
    }
    const bands = [
      [ids.big, "frontend", "TX", 100, 30, 140_000],
      [ids.big, "frontend", "CA", 20, 10, 170_000],
      [ids.big, "backend", "TX", 50, 5, 150_000],
      [ids.small, "frontend", "TX", 12, 1, null],
      [ids.uni, "frontend", "TX", 12, 5, 90_000],
    ];
    for (const [id, bucket, state, n, transfers, median] of bands) {
      await db.query(
        `INSERT INTO "WageBand" ("employerId", "fiscalYear", "socCode", "titleBucket",
           "worksiteState", n, "changeEmployer", p25, median, p75)
         VALUES ($1, $2, '15-1252.00', $3, $4, $5, $6, $7, $7, $7)`,
        [id, FY, bucket, state, n, transfers, median],
      );
    }
  });

  afterAll(async () => {
    await db.query(
      `DELETE FROM "Employer" WHERE "normalizedName" LIKE 'ZZTEST%'`,
    );
    await db.end();
  });

  test("search matches display and normalized names, busiest employer first", async () => {
    const hits = await searchEmployers(db, "zztest");
    expect(hits.map((h) => h.name).slice(0, 3)).toEqual([
      "ZZTEST BIGCO Inc.",
      "ZZTEST SMALLCO Inc.",
      "ZZTEST STATE UNIVERSITY Inc.",
    ]);
    expect(hits[0]).toMatchObject({
      fiscalYear: FY,
      lcaCertified: 120,
      transfers: 40,
    });
  });

  test("search treats % and _ literally", async () => {
    expect(await searchEmployers(db, "ZZTEST%BIG")).toEqual([]);
  });

  test("discover ranks by certified LCAs for the bucket and state", async () => {
    const query = DiscoverQuery.parse({ bucket: "frontend", state: "tx" });
    const rows = await discoverSponsors(db, { ...query, fy: FY });
    const mine = rows.filter((r) => r.name.startsWith("ZZTEST"));
    expect(
      mine.map((r) => [r.name, r.certified, r.transfers, r.medianPay]),
    ).toEqual([
      ["ZZTEST BIGCO Inc.", 100, 30, 140_000],
      // tied on certified, so more transfers ranks first
      ["ZZTEST STATE UNIVERSITY Inc.", 12, 5, 90_000],
      ["ZZTEST SMALLCO Inc.", 12, 1, null],
    ]);
    expect(mine[1].capExemptHint).toBe(true);
  });

  test("discover without a state sums every state and reports the largest group's median", async () => {
    const rows = await discoverSponsors(db, {
      bucket: "frontend",
      fy: FY,
      limit: 50,
    });
    const big = rows.find((r) => r.id === ids.big);
    expect(big).toMatchObject({
      certified: 120,
      transfers: 40,
      medianPay: 140_000,
    });
  });

  test("employer detail returns years and wage bands with medians", async () => {
    const detail = await getEmployer(db, ids.big);
    expect(detail?.years.find((y) => y.fiscalYear === FY)).toMatchObject({
      lcaCertified: 120,
    });
    expect(
      detail?.wageBands.map((b) => [b.titleBucket, b.worksiteState]),
    ).toEqual([
      ["frontend", "TX"],
      ["backend", "TX"],
      ["frontend", "CA"],
    ]);
    expect(await getEmployer(db, "no-such-id")).toBeNull();
  });
});

test("discover query validation", () => {
  expect(DiscoverQuery.safeParse({ bucket: "astronaut" }).success).toBe(false);
  expect(
    DiscoverQuery.safeParse({ bucket: "frontend", state: "Texas" }).success,
  ).toBe(false);
  expect(DiscoverQuery.parse({ bucket: "frontend", fy: "2025" })).toEqual({
    bucket: "frontend",
    fy: 2025,
    limit: 50,
  });
});
