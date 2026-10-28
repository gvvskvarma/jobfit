import { EvidenceDraft } from "@jobfit/shared";
import { env } from "cloudflare:workers";
import { z } from "zod";

import { agent, currentEmail, currentUserId } from "~/lib/auth.server";
import { withDb } from "~/lib/db.server";
import {
  BankFullError,
  MAX_BANK_ITEMS,
  addEvidence,
  embedPending,
  ensureUser,
  listEvidence,
} from "~/lib/evidence.server";

import type { Route } from "./+types/api.evidence";

export async function loader(args: Route.LoaderArgs) {
  const userId = await currentUserId(args);
  if (!userId) return Response.json({ error: "Sign in." }, { status: 401 });
  return withDb(env.DATABASE_URL, async (db) =>
    Response.json({ items: await listEvidence(db, userId) }),
  );
}

/** POST {items: EvidenceDraft[]} adds items to the bank. */
export async function action(args: Route.ActionArgs) {
  const userId = await currentUserId(args);
  if (!userId) return Response.json({ error: "Sign in." }, { status: 401 });
  if (args.request.method !== "POST") {
    return Response.json({ error: "Use POST." }, { status: 405 });
  }
  const input = z
    .object({ items: z.array(EvidenceDraft).min(1).max(MAX_BANK_ITEMS) })
    .safeParse(await args.request.json().catch(() => null));
  if (!input.success) {
    return Response.json(
      { error: input.error.issues[0].message },
      { status: 400 },
    );
  }
  return withDb(env.DATABASE_URL, async (db) => {
    await ensureUser(db, userId, () => currentEmail(args, userId));
    try {
      const added = await addEvidence(db, userId, input.data.items);
      await embedPending(agent(), userId);
      return Response.json({ added }, { status: 201 });
    } catch (e) {
      if (!(e instanceof BankFullError)) throw e;
      return Response.json({ error: e.message }, { status: 409 });
    }
  });
}
