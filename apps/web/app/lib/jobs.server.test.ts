import pg from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  DAILY_SCREENINGS,
  createJob,
  getJob,
  recentJobs,
  saveUser,
  signRequest,
} from "./jobs.server";

const url = process.env.DATABASE_URL;
// A non-superuser role: superusers bypass RLS, the app's database role doesn't.
const ROLE = "jobfit_rls_test";
const ALICE = "zztest_alice";
const BOB = "zztest_bob";
const JD = "Frontend Engineer at ZZTest Robotics. ".repeat(3);

test("signs requests exactly like the agent verifies them", async () => {
  // From services/agent: signature("test-secret", "1700000000", "user_1", b'{"job_text":"x"}')
  expect(
    await signRequest(
      "test-secret",
      "1700000000",
      "user_1",
      '{"job_text":"x"}',
    ),
  ).toBe("80fdacb7c8f81fc847603bf21a20fe3a30c93ed9e342d47cf91b95b37bc0f126");
});

describe.skipIf(!url)("jobs under row-level security", () => {
  const db = new pg.Client({ connectionString: url });

  const cleanup = () =>
    db.query(
      `RESET ROLE;
       DELETE FROM "JobPosting" WHERE "userId" LIKE 'zztest_%';
       DELETE FROM "User" WHERE id LIKE 'zztest_%';`,
    );

  beforeAll(async () => {
    await db.connect();
    await db.query(
      `DO $$ BEGIN CREATE ROLE ${ROLE} NOLOGIN;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;
       GRANT SELECT, INSERT, UPDATE ON "User", "JobPosting" TO ${ROLE};`,
    );
    await cleanup();
    await db.query(`SET ROLE ${ROLE}`);
    await saveUser(db, ALICE, "alice@test", "H1B");
    await saveUser(db, BOB, "bob@test", null);
  });

  afterAll(async () => {
    await cleanup();
    await db.end();
  });

  test("a user only sees their own jobs", async () => {
    const id = await createJob(db, ALICE, JD, "https://jobs.example.com/1");
    expect(id).not.toBeNull();
    const job = await getJob(db, ALICE, id!);
    expect(job?.rawText).toBe(JD);
    expect(job?.source).toBe("https://jobs.example.com/1");
    expect(await getJob(db, BOB, id!)).toBeNull();
    expect(await recentJobs(db, BOB)).toEqual([]);
  });

  test("cannot write a job into someone else's account", async () => {
    await expect(
      db.query(
        `INSERT INTO "JobPosting" (id, "userId", "rawText") VALUES ('x', $1, 'x')`,
        [ALICE],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  test("stops at the daily limit", async () => {
    for (
      let i = (await recentJobs(db, BOB)).length;
      i < DAILY_SCREENINGS;
      i++
    ) {
      expect(await createJob(db, BOB, JD)).not.toBeNull();
    }
    expect(await createJob(db, BOB, JD)).toBeNull();
  });
});
