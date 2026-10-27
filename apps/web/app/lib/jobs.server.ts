import { ScreeningReport, type VISA_STATUSES } from "@jobfit/shared";

import type { Db } from "./db.server";

export type VisaStatus = (typeof VISA_STATUSES)[number];

export const DAILY_SCREENINGS = 30;

export interface Job {
  id: string;
  rawText: string;
  company: string | null;
  title: string | null;
  screening: unknown;
  createdAt: Date;
}

/** Runs fn in a transaction where row-level security only shows this user's rows. */
export async function asUser<T>(
  db: Db,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await db.query("BEGIN");
  try {
    await db.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await fn();
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}

export async function getVisaStatus(
  db: Db,
  userId: string,
): Promise<{ exists: boolean; visaStatus: VisaStatus | null }> {
  const { rows } = await asUser(db, userId, () =>
    db.query<{ visaStatus: VisaStatus | null }>(
      `SELECT "visaStatus" FROM "User" WHERE id = $1`,
      [userId],
    ),
  );
  return { exists: rows.length > 0, visaStatus: rows[0]?.visaStatus ?? null };
}

export async function saveUser(
  db: Db,
  userId: string,
  email: string,
  visaStatus: VisaStatus | null,
): Promise<void> {
  await asUser(db, userId, () =>
    db.query(
      `INSERT INTO "User" (id, email, "visaStatus") VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET "visaStatus" = EXCLUDED."visaStatus"`,
      [userId, email, visaStatus],
    ),
  );
}

/** Creates a posting unless the user already hit today's limit; returns null when they have. */
export async function createJob(
  db: Db,
  userId: string,
  rawText: string,
): Promise<string | null> {
  return asUser(db, userId, async () => {
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "JobPosting"
       WHERE "userId" = $1 AND "createdAt" > now() - interval '1 day'`,
      [userId],
    );
    if (rows[0].n >= DAILY_SCREENINGS) return null;
    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO "JobPosting" (id, "userId", source, "rawText") VALUES ($1, $2, 'pasted', $3)`,
      [id, userId, rawText],
    );
    return id;
  });
}

export async function getJob(
  db: Db,
  userId: string,
  id: string,
): Promise<Job | null> {
  const { rows } = await asUser(db, userId, () =>
    db.query<Job>(
      `SELECT id, "rawText", company, title, screening, "createdAt"
       FROM "JobPosting" WHERE id = $1`,
      [id],
    ),
  );
  return rows[0] ?? null;
}

export async function recentJobs(
  db: Db,
  userId: string,
): Promise<
  Pick<Job, "id" | "company" | "title" | "screening" | "createdAt">[]
> {
  const { rows } = await asUser(db, userId, () =>
    db.query<Job>(
      `SELECT id, company, title, screening, "createdAt" FROM "JobPosting"
       ORDER BY "createdAt" DESC LIMIT 10`,
    ),
  );
  return rows;
}

export async function saveScreening(
  db: Db,
  userId: string,
  id: string,
  report: ScreeningReport,
): Promise<void> {
  await asUser(db, userId, () =>
    db.query(
      `UPDATE "JobPosting" SET screening = $2, parsed = $3, company = $4, title = $5
       WHERE id = $1`,
      [
        id,
        report,
        report.parsed,
        report.parsed?.company ?? report.employer.employer,
        report.parsed?.title ?? null,
      ],
    ),
  );
}

export class AgentError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Signs `{timestamp}.{userId}.{body}` the way services/agent/app/main.py verifies it. */
export async function signRequest(
  secret: string,
  timestamp: string,
  userId: string,
  body: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      enc.encode(`${timestamp}.${userId}.${body}`),
    ),
  );
}

export async function callAgent(
  agent: { url: string; secret: string },
  userId: string,
  jobText: string,
  visaStatus: VisaStatus | null,
): Promise<ScreeningReport> {
  const body = JSON.stringify({
    job_text: jobText,
    user: { visa_status: visaStatus },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  let res: Response;
  try {
    res = await fetch(`${agent.url}/screen`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jobfit-timestamp": timestamp,
        "x-jobfit-user": userId,
        "x-jobfit-signature": await signRequest(
          agent.secret,
          timestamp,
          userId,
          body,
        ),
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new AgentError(503, "The screening service isn't reachable.");
  }
  if (!res.ok) {
    const detail = await res
      .json<{ detail?: unknown }>()
      .then((j) => j.detail)
      .catch(() => null);
    throw new AgentError(
      res.status,
      typeof detail === "string" ? detail : "The screening failed.",
    );
  }
  return ScreeningReport.parse(await res.json());
}

/** Screens a saved posting once; later calls return the stored report. */
export async function screenJob(
  db: Db,
  agent: { url: string; secret: string },
  userId: string,
  job: Job,
): Promise<ScreeningReport> {
  if (job.screening) return ScreeningReport.parse(job.screening);
  const { visaStatus } = await getVisaStatus(db, userId);
  const report = await callAgent(agent, userId, job.rawText, visaStatus);
  await saveScreening(db, userId, job.id, report);
  return report;
}
