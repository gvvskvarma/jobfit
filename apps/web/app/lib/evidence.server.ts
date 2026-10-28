import { EvidenceDraft, EvidenceHit } from "@jobfit/shared";
import { Buffer } from "node:buffer";
import { z } from "zod";

import type { Db } from "./db.server";
import { AgentError, asUser, postAgent } from "./jobs.server";

type Agent = { url: string; secret: string };

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MAX_BANK_ITEMS = 300;

export interface Evidence extends EvidenceDraft {
  id: string;
  embedded: boolean;
}

/** Creates the user row on first write; email is only fetched (from Clerk) when it's missing. */
export async function ensureUser(
  db: Db,
  userId: string,
  email: () => Promise<string>,
): Promise<void> {
  const { rows } = await asUser(db, userId, () =>
    db.query(`SELECT 1 FROM "User" WHERE id = $1`, [userId]),
  );
  if (rows.length) return;
  const address = await email();
  await asUser(db, userId, () =>
    db.query(
      `INSERT INTO "User" (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [userId, address],
    ),
  );
}

export async function listEvidence(
  db: Db,
  userId: string,
): Promise<Evidence[]> {
  const { rows } = await asUser(db, userId, () =>
    db.query<Evidence>(
      `SELECT id, kind, text, company, project, tags,
              to_char("startDate", 'YYYY-MM') AS start, to_char("endDate", 'YYYY-MM') AS "end",
              embedding IS NOT NULL AS embedded
       FROM "Evidence" WHERE "userId" = $1 ORDER BY "createdAt", id`,
      [userId],
    ),
  );
  return rows;
}

/** Saves items in the order given; returns how many were saved. */
export async function addEvidence(
  db: Db,
  userId: string,
  items: EvidenceDraft[],
): Promise<number> {
  return asUser(db, userId, async () => {
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "Evidence" WHERE "userId" = $1`,
      [userId],
    );
    if (rows[0].n + items.length > MAX_BANK_ITEMS) {
      throw new BankFullError();
    }
    const { rowCount } = await db.query(
      `INSERT INTO "Evidence"
         (id, "userId", kind, text, company, project, tags, "startDate", "endDate")
       SELECT gen_random_uuid()::text, $1, (j->>'kind')::"EvidenceKind", j->>'text',
              j->>'company', j->>'project',
              ARRAY(SELECT jsonb_array_elements_text(j->'tags')),
              to_date(j->>'start', 'YYYY-MM'), to_date(j->>'end', 'YYYY-MM')
       FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS x(j, n)
       ORDER BY x.n`,
      [userId, JSON.stringify(items)],
    );
    return rowCount ?? 0;
  });
}

export class BankFullError extends Error {
  constructor() {
    super(
      `The experience bank holds up to ${MAX_BANK_ITEMS} items. Delete some before adding more.`,
    );
  }
}

/** Clearing the embedding makes the agent re-embed the new text. */
export async function updateEvidence(
  db: Db,
  userId: string,
  id: string,
  item: EvidenceDraft,
): Promise<boolean> {
  const { rowCount } = await asUser(db, userId, () =>
    db.query(
      `UPDATE "Evidence" SET kind = $2::"EvidenceKind", text = $3, company = $4,
         project = $5, tags = $6, "startDate" = to_date($7, 'YYYY-MM'),
         "endDate" = to_date($8, 'YYYY-MM'), embedding = NULL
       WHERE id = $1 AND "userId" = $9`,
      [
        id,
        item.kind,
        item.text,
        item.company,
        item.project,
        item.tags,
        item.start,
        item.end,
        userId,
      ],
    ),
  );
  return rowCount === 1;
}

export async function deleteEvidence(
  db: Db,
  userId: string,
  id: string,
): Promise<boolean> {
  const { rowCount } = await asUser(db, userId, () =>
    db.query(`DELETE FROM "Evidence" WHERE id = $1 AND "userId" = $2`, [
      id,
      userId,
    ]),
  );
  return rowCount === 1;
}

/** The agent reads the file and splits it into items; nothing is saved until the user reviews them. */
export async function importResume(
  agent: Agent,
  userId: string,
  file: File,
): Promise<EvidenceDraft[]> {
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  return z
    .array(EvidenceDraft)
    .parse(
      await postAgent(
        agent,
        userId,
        "/evidence/import",
        { filename: file.name, data },
        120_000,
      ),
    );
}

/** Best effort: when the agent is down, the next search embeds whatever is pending. */
export async function embedPending(agent: Agent, userId: string) {
  await postAgent(agent, userId, "/evidence/embed", {}).catch((e) => {
    if (!(e instanceof AgentError)) throw e;
  });
}

export async function searchEvidence(
  agent: Agent,
  userId: string,
  query: string,
  topK = 8,
): Promise<EvidenceHit[]> {
  return z.array(EvidenceHit).parse(
    await postAgent(agent, userId, "/evidence/search", {
      query,
      top_k: topK,
    }),
  );
}

/** Tags arrive from forms as one comma-separated string. */
export function formDraft(form: FormData) {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return EvidenceDraft.safeParse({
    kind: get("kind"),
    text: get("text") ?? "",
    company: get("company"),
    project: get("project"),
    tags: (get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    start: get("start"),
    end: get("end"),
  });
}
