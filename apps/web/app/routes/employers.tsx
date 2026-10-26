import { EmployerSearchQuery } from "@jobfit/shared";
import { env } from "cloudflare:workers";
import { Form, Link } from "react-router";

import { withDb } from "~/lib/db.server";
import { searchEmployers } from "~/lib/employers.server";
import { formatCount } from "~/lib/format";

import type { Route } from "./+types/employers";

export function meta() {
  return [
    { title: "Look up an employer's H-1B record · JobFit" },
    {
      name: "description",
      content: "Search any US employer's H-1B and green card filings.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const parsed = EmployerSearchQuery.safeParse({ q });
  if (!parsed.success) return { q, hits: null };
  const hits = await withDb(env.DATABASE_URL, (db) =>
    searchEmployers(db, parsed.data.q),
  );
  return { q, hits };
}

export default function Employers({
  loaderData: { q, hits },
}: Route.ComponentProps) {
  return (
    <main>
      <h1 className="text-3xl font-bold tracking-tight">Look up an employer</h1>
      <Form method="get" role="search" className="measure mt-6 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Employer name
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          minLength={2}
          maxLength={100}
          required
          placeholder="Company name, for example Microsoft"
          className="min-w-0 flex-1 rounded-[var(--radius-field)] border border-rule bg-sheet px-3 py-2 text-lg placeholder:text-ink-muted"
        />
        <button
          type="submit"
          className="rounded-[var(--radius-field)] bg-ink px-4 py-2 font-semibold text-paper hover:bg-guilloche"
        >
          Search
        </button>
      </Form>

      {hits === null ? (
        q && <p className="mt-6">Type at least two characters to search.</p>
      ) : hits.length === 0 ? (
        <p className="mt-6">
          No employer matches “{q}”. Try the legal name, such as “Amazon.com
          Services” or “Google”.
        </p>
      ) : (
        <ul className="measure mt-8">
          {hits.map((h) => (
            <li key={h.id} className="border-b border-rule py-3">
              <Link
                to={`/employers/${h.id}`}
                viewTransition
                className="text-lg font-semibold"
                style={{ viewTransitionName: `employer-${h.id}` }}
              >
                {h.name}
              </Link>
              <p className="tabular text-sm text-ink-muted">
                {h.lcaCertified === null
                  ? "No H-1B filings loaded"
                  : `${formatCount(h.lcaCertified)} certified H-1B filings and ${formatCount(h.transfers ?? 0)} transfers in FY${h.fiscalYear}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
