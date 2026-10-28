import { Show, SignInButton } from "@clerk/react-router";
import {
  EVIDENCE_KINDS,
  EvidenceDraft,
  type EvidenceHit,
} from "@jobfit/shared";
import { env } from "cloudflare:workers";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Form, useFetcher, useNavigation } from "react-router";
import { z } from "zod";

import { Working } from "~/components/terminal";
import {
  Hints,
  Meta,
  Panel,
  button,
  field,
  quietButton,
} from "~/components/ui";
import { agent, currentEmail, currentUserId } from "~/lib/auth.server";
import { withDb } from "~/lib/db.server";
import {
  BankFullError,
  MAX_BANK_ITEMS,
  MAX_RESUME_BYTES,
  type Evidence,
  addEvidence,
  deleteEvidence,
  embedPending,
  ensureUser,
  formDraft,
  importResume,
  listEvidence,
  searchEvidence,
  updateEvidence,
} from "~/lib/evidence.server";
import { AgentError, experienceYears } from "~/lib/jobs.server";

import type { Route } from "./+types/bank";

type Kind = (typeof EVIDENCE_KINDS)[number];

const KIND_LABEL: Record<Kind, string> = {
  BULLET: "Job bullet",
  PROJECT: "Project",
  ACHIEVEMENT: "Achievement",
  CERT: "Certification",
  EDUCATION: "Education",
};

const IMPORT_STEPS = [
  "Reading the file",
  "Splitting it into claims",
  "Checking each item matches your resume word for word",
];

const monthName = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const formatMonth = (m: string) => monthName.format(new Date(`${m}-01`));

function dates(start: string | null, end: string | null) {
  if (!start && !end) return null;
  if (!start) return formatMonth(end!);
  return `${formatMonth(start)} to ${end ? formatMonth(end) : "present"}`;
}

export function meta() {
  return [
    { title: "Experience bank · JobFit" },
    {
      name: "description",
      content:
        "The claims JobFit is allowed to put on your resume, imported from your own resume.",
    },
  ];
}

export async function loader(args: Route.LoaderArgs) {
  const userId = await currentUserId(args);
  if (!userId) return { items: [], years: null };
  return withDb(env.DATABASE_URL, async (db) => ({
    items: await listEvidence(db, userId),
    years: await experienceYears(db, userId),
  }));
}

type ActionResult =
  | { error: string }
  | { drafts: EvidenceDraft[]; importId: string; filename: string }
  | { saved: number }
  | { hits: EvidenceHit[] }
  | { ok: true };

export async function action(args: Route.ActionArgs): Promise<ActionResult> {
  const userId = await currentUserId(args);
  if (!userId) return { error: "Sign in to use your experience bank." };
  const form = await args.request.formData();
  const intent = form.get("intent");

  if (intent === "import") {
    const file = form.get("resume");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Choose a .docx or .pdf resume first." };
    }
    if (file.size > MAX_RESUME_BYTES) {
      return { error: "The resume file is larger than 5 MB." };
    }
    try {
      const drafts = await importResume(agent(), userId, file);
      if (!drafts.length) {
        return {
          error:
            "No claims could be read from that resume. Try the other format, or add items by hand below.",
        };
      }
      return { drafts, importId: crypto.randomUUID(), filename: file.name };
    } catch (e) {
      if (!(e instanceof AgentError)) throw e;
      return { error: e.message };
    }
  }

  if (intent === "search") {
    const query = String(form.get("query") ?? "").trim();
    if (!query)
      return { error: "Type what a job asks for, like “led a migration”." };
    try {
      return {
        hits: await searchEvidence(agent(), userId, query.slice(0, 500)),
      };
    } catch (e) {
      if (!(e instanceof AgentError)) throw e;
      return { error: e.message };
    }
  }

  return withDb(env.DATABASE_URL, async (db): Promise<ActionResult> => {
    if (intent === "delete") {
      await deleteEvidence(db, userId, String(form.get("id")));
      return { ok: true };
    }

    let items: EvidenceDraft[];
    if (intent === "save") {
      const parsed = z
        .array(EvidenceDraft)
        .min(1, "Keep at least one item, or discard the import.")
        .max(MAX_BANK_ITEMS)
        .safeParse(parseJson(String(form.get("items") ?? "[]")));
      if (!parsed.success) return { error: parsed.error.issues[0].message };
      items = parsed.data;
    } else if (intent === "add" || intent === "update") {
      const parsed = formDraft(form);
      if (!parsed.success) return { error: parsed.error.issues[0].message };
      items = [parsed.data];
    } else {
      return { error: "Unknown action." };
    }

    if (intent === "update") {
      await updateEvidence(db, userId, String(form.get("id")), items[0]);
    } else {
      await ensureUser(db, userId, () => currentEmail(args, userId));
      try {
        await addEvidence(db, userId, items);
      } catch (e) {
        if (!(e instanceof BankFullError)) throw e;
        return { error: e.message };
      }
    }
    await embedPending(agent(), userId);
    return intent === "save" ? { saved: items.length } : { ok: true };
  });
}

function parseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function ErrorLine({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="border-l-2 border-denial pl-3 text-denial">
      ✗ {message}
    </p>
  );
}

const errorOf = (d: unknown) =>
  d && typeof d === "object" && "error" in d ? String(d.error) : undefined;

/** Kind, text, employer, project, dates and tags: shared by the add and edit forms. */
function ItemFields({ item }: { item?: Partial<EvidenceDraft> }) {
  const label = "block text-xs text-ink-muted";
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className={label}>what you did, as it reads on your resume</span>
        <textarea
          name="text"
          required
          maxLength={1000}
          rows={2}
          defaultValue={item?.text}
          className={`${field} mt-1 block w-full resize-y leading-relaxed`}
        />
      </label>
      <label>
        <span className={label}>kind</span>
        <select
          name="kind"
          defaultValue={item?.kind ?? "BULLET"}
          className={`${field} mt-1 w-full`}
        >
          {EVIDENCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={label}>employer</span>
        <input
          name="company"
          maxLength={200}
          defaultValue={item?.company ?? ""}
          className={`${field} mt-1 w-full`}
        />
      </label>
      <label>
        <span className={label}>started</span>
        <input
          type="month"
          name="start"
          placeholder="2021-03"
          defaultValue={item?.start ?? ""}
          className={`${field} mt-1 w-full`}
        />
      </label>
      <label>
        <span className={label}>ended (empty if current)</span>
        <input
          type="month"
          name="end"
          placeholder="2024-06"
          defaultValue={item?.end ?? ""}
          className={`${field} mt-1 w-full`}
        />
      </label>
      <label>
        <span className={label}>project</span>
        <input
          name="project"
          maxLength={200}
          defaultValue={item?.project ?? ""}
          className={`${field} mt-1 w-full`}
        />
      </label>
      <label>
        <span className={label}>skills, comma separated</span>
        <input
          name="tags"
          placeholder="react, performance"
          defaultValue={item?.tags?.join(", ")}
          className={`${field} mt-1 w-full`}
        />
      </label>
    </div>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <span className="text-xs text-ink-muted">
      {tags.map((t) => (
        <span key={t} className="mr-2">
          #{t}
        </span>
      ))}
    </span>
  );
}

/** Imported items print in like terminal output; nothing is saved until the user says so. */
function Review({
  drafts,
  filename,
}: {
  drafts: EvidenceDraft[];
  filename: string;
}) {
  const still = useReducedMotion();
  const [items, setItems] = useState(drafts);
  const [keep, setKeep] = useState(() => drafts.map(() => true));
  const [dismissed, setDismissed] = useState(false);
  const saving = useNavigation().formData?.get("intent") === "save";
  if (dismissed) return null;
  const kept = items.filter((_, i) => keep[i]);
  const setText = (i: number, text: string) =>
    setItems((all) => all.map((it, j) => (j === i ? { ...it, text } : it)));

  return (
    <LazyMotion features={domAnimation} strict>
      <Panel
        title={`review: ${drafts.length} items from ${filename}`}
        className="border-accent"
      >
        <p className="measure mb-4 text-sm text-ink-muted">
          Each item is copied word for word from your resume. Untick anything
          you wouldn't want to be asked about in an interview, and fix any typos
          before saving.
        </p>
        <ul className="space-y-4">
          {items.map((it, i) => (
            <m.li
              key={i}
              className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={
                still ? { duration: 0 } : { delay: i * 0.06, duration: 0.25 }
              }
            >
              <input
                type="checkbox"
                checked={keep[i]}
                onChange={(e) =>
                  setKeep((k) =>
                    k.map((v, j) => (j === i ? e.target.checked : v)),
                  )
                }
                aria-label={`Keep: ${it.text}`}
                className="mt-1.5 size-4 accent-[var(--accent)]"
              />
              <div className={keep[i] ? "" : "opacity-50"}>
                <p className="text-xs text-ink-muted">
                  {[
                    KIND_LABEL[it.kind],
                    it.company,
                    it.project,
                    dates(it.start, it.end),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <textarea
                  value={it.text}
                  onChange={(e) => setText(i, e.target.value)}
                  rows={Math.max(1, Math.ceil(it.text.length / 80))}
                  aria-label="Item text"
                  className="mt-1 block w-full resize-y rounded-[var(--radius-field)] border border-transparent bg-transparent leading-relaxed hover:border-rule focus:border-accent focus:outline-none"
                />
                <Tags tags={it.tags} />
              </div>
            </m.li>
          ))}
        </ul>
        <Form method="post" className="mt-6 flex flex-wrap items-center gap-3">
          <input type="hidden" name="intent" value="save" />
          <input type="hidden" name="items" value={JSON.stringify(kept)} />
          <button
            type="submit"
            disabled={saving || !kept.length}
            className={button}
          >
            <span aria-hidden>◼</span>{" "}
            {saving ? "Saving…" : `Save ${kept.length} items`}
          </button>
          <button
            type="button"
            className={quietButton}
            onClick={() => setDismissed(true)}
          >
            Discard
          </button>
        </Form>
      </Panel>
    </LazyMotion>
  );
}

function Search() {
  const search = useFetcher<ActionResult>();
  const hits =
    search.data && "hits" in search.data ? search.data.hits : undefined;
  return (
    <Panel
      title={
        <>
          <span className="text-pink">›</span> search the bank
        </>
      }
    >
      <search.Form method="post" className="flex flex-wrap gap-3">
        <input type="hidden" name="intent" value="search" />
        <label htmlFor="query" className="sr-only">
          What a job asks for
        </label>
        <input
          id="query"
          name="query"
          maxLength={500}
          placeholder="What a job asks for, like “web performance”"
          className={`${field} min-w-0 flex-1 basis-64`}
        />
        <button
          type="submit"
          disabled={search.state !== "idle"}
          className={quietButton}
        >
          {search.state !== "idle" ? "Searching…" : "Search"}
        </button>
      </search.Form>
      <p className="mt-2 text-xs text-ink-muted">
        This is how JobFit finds the items to cite when it tailors a resume. If
        the right item isn't near the top, add the skill to its tags.
      </p>
      <div className="mt-3">
        <ErrorLine message={errorOf(search.data)} />
      </div>
      {hits && (
        <ol className="mt-2 space-y-2" aria-label="Best matches first">
          {hits.length === 0 && (
            <li className="text-sm text-ink-muted">
              Nothing in your bank yet. Import a resume above.
            </li>
          )}
          {hits.map((h, i) => (
            <li
              key={h.evidence_id}
              className="grid grid-cols-[1.5rem_minmax(0,1fr)] text-sm"
            >
              <span
                aria-hidden
                className={i < 3 ? "text-accent" : "text-ink-muted"}
              >
                {i < 3 ? "▸" : "·"}
              </span>
              <span className={i < 3 ? "" : "text-ink-muted"}>{h.text}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Item({ item }: { item: Evidence }) {
  const [editing, setEditing] = useState(false);
  const save = useFetcher<ActionResult>();
  const remove = useFetcher<ActionResult>();
  if (remove.state !== "idle") return null;
  if (editing) {
    return (
      <li className="py-3">
        <save.Form
          method="post"
          className="space-y-3"
          onSubmit={() => setEditing(false)}
        >
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="id" value={item.id} />
          <ItemFields item={item} />
          <div className="flex gap-3">
            <button type="submit" className={button}>
              <span aria-hidden>◼</span> Save changes
            </button>
            <button
              type="button"
              className={quietButton}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </save.Form>
      </li>
    );
  }
  return (
    <li className="group -mx-2 grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2 sm:grid-cols-[1.25rem_minmax(0,1fr)_auto] rounded-[2px] px-2 py-1.5 transition-colors hover:bg-select">
      <span aria-hidden className="text-pink">
        ›
      </span>
      <div>
        <p>{item.text}</p>
        <Tags tags={item.tags} />
        <ErrorLine message={errorOf(save.data)} />
      </div>
      <div className="col-start-2 -ml-1.5 flex items-start gap-1 text-xs sm:col-start-3 sm:row-start-1 sm:ml-0">
        <button
          type="button"
          className="rounded-[2px] px-1.5 py-0.5 text-ink-muted hover:bg-paper hover:text-ink"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
        <remove.Form
          method="post"
          onSubmit={(e) => {
            if (!confirm("Delete this item from your bank?"))
              e.preventDefault();
          }}
        >
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="id" value={item.id} />
          <button
            type="submit"
            className="rounded-[2px] px-1.5 py-0.5 text-denial hover:bg-paper"
          >
            Delete
          </button>
        </remove.Form>
      </div>
    </li>
  );
}

/** Jobs grouped the way a resume is, then the sections without an employer. */
function groups(items: Evidence[]) {
  const out = new Map<string, { title: string; items: Evidence[] }>();
  for (const it of items) {
    const key =
      it.kind === "BULLET" || it.kind === "ACHIEVEMENT"
        ? `job:${it.company ?? ""}`
        : it.kind === "PROJECT"
          ? "projects"
          : "education";
    const title =
      key === "projects"
        ? "projects"
        : key === "education"
          ? "education and certifications"
          : [it.company ?? "other experience", dates(it.start, it.end)]
              .filter(Boolean)
              .join(" · ");
    if (!out.has(key)) out.set(key, { title, items: [] });
    out.get(key)!.items.push(it);
  }
  return [...out.values()];
}

export default function Bank({ loaderData, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const importing = nav.formData?.get("intent") === "import";
  const add = useFetcher<ActionResult>();
  const { items, years } = loaderData;
  const employers = new Set(
    items.filter((i) => i.kind === "BULLET").map((i) => i.company),
  ).size;
  const review = actionData && "drafts" in actionData ? actionData : undefined;

  return (
    <main className="space-y-10">
      <header className="space-y-3">
        <h1 className="text-2xl font-bold sm:text-3xl">
          <span aria-hidden className="mr-3 text-pink">
            ●
          </span>
          Experience bank
        </h1>
        <p className="measure text-ink-muted">
          The claims JobFit is allowed to make about you. Every line it writes
          on a tailored resume, cover letter or interview answer has to cite one
          of these, so anything not in the bank never shows up.
        </p>
        {items.length > 0 && (
          <Meta>
            {items.length} items from {employers}{" "}
            {employers === 1 ? "employer" : "employers"}
            {years !== null && ` · about ${years} years of experience`}
          </Meta>
        )}
      </header>

      <Show when="signed-out">
        <SignInButton mode="modal">
          <button type="button" className={button}>
            <span aria-hidden>◼</span> Sign in to build your bank
          </button>
        </SignInButton>
      </Show>

      <Show when="signed-in">
        <Form method="post" encType="multipart/form-data" className="space-y-4">
          <Panel
            title={
              <>
                <span className="text-pink">›</span> import a resume
              </>
            }
          >
            <input type="hidden" name="intent" value="import" />
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="resume" className="sr-only">
                Resume file
              </label>
              <input
                id="resume"
                type="file"
                name="resume"
                required
                accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="min-w-0 flex-1 basis-64 text-sm file:mr-3 file:rounded-[var(--radius-field)] file:border file:border-rule file:bg-paper file:px-3 file:py-1 file:font-semibold file:text-ink hover:file:border-accent"
              />
              <button type="submit" disabled={importing} className={button}>
                <span aria-hidden>◼</span> Read my resume
              </button>
            </div>
          </Panel>
          {importing ? (
            <Working steps={IMPORT_STEPS} />
          ) : (
            <Hints
              items={[
                ".docx or .pdf, up to 5 MB",
                "nothing is saved until you review it",
              ]}
            />
          )}
          {!add.data && <ErrorLine message={errorOf(actionData)} />}
          {actionData && "saved" in actionData && (
            <p role="status" className="text-approval">
              ✓ Saved {actionData.saved} items to your bank.
            </p>
          )}
        </Form>

        {review && (
          <Review
            key={review.importId}
            drafts={review.drafts}
            filename={review.filename}
          />
        )}

        {items.length > 0 && <Search />}

        {groups(items).map((g) => (
          <Panel key={g.title} title={g.title}>
            <ul>
              {g.items.map((it) => (
                <Item key={`${it.id}:${it.text}`} item={it} />
              ))}
            </ul>
          </Panel>
        ))}

        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold">
            <span aria-hidden className="mr-2 text-pink">
              ›
            </span>
            Add an item by hand
          </summary>
          <add.Form
            key={add.data && "ok" in add.data ? items.length : "form"}
            method="post"
            className="mt-4 space-y-3"
          >
            <input type="hidden" name="intent" value="add" />
            <ItemFields />
            <ErrorLine message={errorOf(add.data)} />
            <button
              type="submit"
              disabled={add.state !== "idle"}
              className={button}
            >
              <span aria-hidden>◼</span> Add to bank
            </button>
          </add.Form>
        </details>
      </Show>
    </main>
  );
}
