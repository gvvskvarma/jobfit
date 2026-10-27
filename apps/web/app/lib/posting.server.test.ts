import { afterEach, expect, test, vi } from "vitest";

import {
  PostingError,
  atsSource,
  checkLink,
  fetchPosting,
  htmlToText,
  jsonLdPosting,
  postingText,
} from "./posting.server";

afterEach(() => vi.unstubAllGlobals());

test("refuses links that could reach our own network or a job board", () => {
  for (const bad of [
    "http://careers.example.com/1",
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://[::1]/x",
    "https://10.0.0.5/x",
    "https://intranet/x",
    "https://admin.corp/x",
    "https://careers.example.com:8443/x",
    "https://user:pw@careers.example.com/x",
    "javascript:alert(1)",
  ]) {
    expect(() => checkLink(bad), bad).toThrow(PostingError);
  }
  expect(() => checkLink("https://www.linkedin.com/jobs/view/123")).toThrow(
    /linkedin\.com doesn't allow automated access/,
  );
  expect(checkLink("https://careers.example.com/jobs/1").hostname).toBe(
    "careers.example.com",
  );
});

test("maps ATS links to their public posting APIs", () => {
  const src = (u: string) => atsSource(new URL(u));
  expect(
    src("https://job-boards.greenhouse.io/anthropic/jobs/5456619008"),
  ).toEqual({
    kind: "greenhouse",
    id: "5456619008",
    api: "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs/5456619008",
  });
  expect(src("https://jobs.lever.co/palantir/6ed76ce8")?.api).toBe(
    "https://api.lever.co/v0/postings/palantir/6ed76ce8",
  );
  expect(src("https://jobs.ashbyhq.com/ashby/7458d4e9")?.kind).toBe("ashby");
  expect(src("https://careers.example.com/jobs/1")).toBeNull();
});

test("turns posting HTML into readable text", () => {
  expect(
    htmlToText(
      "<h2>About</h2><p>We&rsquo;re hiring &amp; growing.</p><ul><li>React</li><li>Go</li></ul><script>x()</script>",
    ),
  ).toBe("About\nWe’re hiring & growing.\n\n• React\n• Go");
});

test("reads the schema.org JobPosting a careers page publishes", () => {
  const html = `<html><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "Acme" },
      {
        "@type": "JobPosting",
        title: "Frontend Engineer",
        hiringOrganization: { name: "Acme Robotics" },
        jobLocation: {
          address: { addressLocality: "Austin", addressRegion: "TX" },
        },
        description:
          "&lt;p&gt;Build things.&lt;/p&gt;&lt;p&gt;We sponsor visas.&lt;/p&gt;",
      },
    ],
  })}</script></html>`;
  const p = jsonLdPosting(html)!;
  expect(p).toEqual({
    title: "Frontend Engineer",
    company: "Acme Robotics",
    location: "Austin, TX",
    text: "Build things.\nWe sponsor visas.",
  });
  expect(postingText(p)).toBe(
    "Frontend Engineer\nAcme Robotics · Austin, TX\n\nBuild things.\nWe sponsor visas.",
  );
  expect(jsonLdPosting("<html>no data</html>")).toBeNull();
});

test("rechecks the address a redirect lands on", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const res = new Response("<html></html>", { status: 200 });
      Object.defineProperty(res, "url", { value: "https://127.0.0.1/admin" });
      return res;
    }),
  );
  await expect(
    fetchPosting("https://careers.example.com/jobs/1"),
  ).rejects.toThrow(PostingError);
});
