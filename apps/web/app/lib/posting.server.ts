/**
 * Turns a job link into posting text. ATS links use the ATS's public posting API;
 * other company pages use the schema.org JobPosting data they publish for search
 * engines. Job boards forbid automated access, so their links are refused (CLAUDE.md).
 */

export class PostingError extends Error {}

export interface Posting {
  title: string | null;
  company: string | null;
  location: string | null;
  text: string;
}

const JOB_BOARDS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "monster.com",
  "dice.com",
  "simplyhired.com",
  "careerbuilder.com",
  "wellfound.com",
  "builtin.com",
  "handshake.com",
  "joinhandshake.com",
];

const MAX_BYTES = 2_000_000;

/** Only public https pages: no IP literals or internal names, so the link can't reach our own network. */
export function checkLink(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PostingError("That job link isn't a valid web address.");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":") ||
    /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host)
  ) {
    throw new PostingError(
      "Use the posting's public https:// link from the company's careers page.",
    );
  }
  const board = JOB_BOARDS.find((b) => host === b || host.endsWith(`.${b}`));
  if (board) {
    throw new PostingError(
      `${board} doesn't allow automated access. Open the posting there, copy the description and paste it below. The link is still saved for the apply button.`,
    );
  }
  return url;
}

/** Which public ATS API serves this link, if any. */
export function atsSource(
  url: URL,
): { kind: "greenhouse" | "lever" | "ashby"; api: string; id: string } | null {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") &&
    parts[1] === "jobs" &&
    parts[2]
  ) {
    return {
      kind: "greenhouse",
      id: parts[2],
      api: `https://boards-api.greenhouse.io/v1/boards/${parts[0]}/jobs/${parts[2]}`,
    };
  }
  if (host === "jobs.lever.co" && parts[1]) {
    return {
      kind: "lever",
      id: parts[1],
      api: `https://api.lever.co/v0/postings/${parts[0]}/${parts[1]}`,
    };
  }
  if (host === "jobs.ashbyhq.com" && parts[1]) {
    return {
      kind: "ashby",
      id: parts[1],
      api: `https://api.ashbyhq.com/posting-api/job-board/${parts[0]}`,
    };
  }
  // ponytail: company sites that embed Greenhouse (?gh_jid=) fall through to JSON-LD; most publish it.
  return null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  bull: "•",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[\da-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code =
        e[1] === "x" || e[1] === "X"
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Readable text from posting HTML: block tags become line breaks, list items bullets. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|ul|ol|section|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface JsonLdPosting {
  "@type"?: string | string[];
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?:
    | { address?: { addressLocality?: string; addressRegion?: string } }
    | { address?: { addressLocality?: string; addressRegion?: string } }[];
  "@graph"?: JsonLdPosting[];
}

/** The schema.org JobPosting a careers page publishes for Google Jobs. */
export function jsonLdPosting(html: string): Posting | null {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, body] of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      continue;
    }
    const nodes = (Array.isArray(data) ? data : [data]).flatMap(
      (n: JsonLdPosting) => [n, ...(n["@graph"] ?? [])],
    );
    const job = nodes.find((n) => [n["@type"]].flat().includes("JobPosting"));
    if (!job?.description) continue;
    const place = [job.jobLocation].flat()[0]?.address;
    const org = job.hiringOrganization;
    return {
      title: job.title ?? null,
      company: typeof org === "string" ? org : (org?.name ?? null),
      location:
        [place?.addressLocality, place?.addressRegion]
          .filter(Boolean)
          .join(", ") || null,
      text: htmlToText(decodeEntities(job.description)),
    };
  }
  return null;
}

async function get(url: string, accept: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept, "user-agent": "JobFit/1.0 (one posting on request)" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PostingError(
      "That page didn't respond. Paste the description instead.",
    );
  }
  if (!res.ok) {
    throw new PostingError(
      res.status === 404
        ? "That posting wasn't found; it may have closed."
        : "That page wouldn't load. Paste the description instead.",
    );
  }
  // A redirect could land somewhere the link check would have refused.
  if (res.url) checkLink(res.url);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) {
    throw new PostingError(
      "That page is too large to read. Paste the description instead.",
    );
  }
  return res;
}

export async function fetchPosting(link: string): Promise<Posting> {
  const url = checkLink(link);
  const ats = atsSource(url);
  if (ats?.kind === "greenhouse") {
    const j = await (
      await get(ats.api, "application/json")
    ).json<{
      title: string;
      company_name?: string;
      location?: { name?: string };
      content: string;
    }>();
    return {
      title: j.title,
      company: j.company_name ?? null,
      location: j.location?.name ?? null,
      text: htmlToText(decodeEntities(j.content)),
    };
  }
  if (ats?.kind === "lever") {
    const j = await (
      await get(ats.api, "application/json")
    ).json<{
      text: string;
      categories?: { location?: string; commitment?: string };
      descriptionPlain?: string;
      lists?: { text: string; content: string }[];
      additionalPlain?: string;
    }>();
    const lists = (j.lists ?? [])
      .map((l) => `${l.text}\n${htmlToText(l.content)}`)
      .join("\n\n");
    return {
      title: j.text,
      company: null,
      location: j.categories?.location ?? null,
      text: [j.descriptionPlain, lists, j.additionalPlain]
        .filter(Boolean)
        .join("\n\n")
        .trim(),
    };
  }
  if (ats?.kind === "ashby") {
    const board = await (
      await get(ats.api, "application/json")
    ).json<{
      jobs: {
        id: string;
        title: string;
        location?: string;
        descriptionPlain?: string;
      }[];
    }>();
    const j = board.jobs.find((job) => job.id === ats.id);
    if (!j?.descriptionPlain) {
      throw new PostingError("That posting wasn't found; it may have closed.");
    }
    return {
      title: j.title,
      company: null,
      location: j.location ?? null,
      text: j.descriptionPlain.trim(),
    };
  }
  const html = (await (await get(url.href, "text/html")).text()).slice(
    0,
    MAX_BYTES,
  );
  const posting = jsonLdPosting(html);
  if (!posting) {
    throw new PostingError(
      "Couldn't find a job description on that page. Copy the description and paste it below.",
    );
  }
  return posting;
}

/** The text JobFit screens: a header the parser can read, then the description. */
export function postingText(p: Posting): string {
  const header = [p.title, [p.company, p.location].filter(Boolean).join(" · ")]
    .filter(Boolean)
    .join("\n");
  return header ? `${header}\n\n${p.text}` : p.text;
}
