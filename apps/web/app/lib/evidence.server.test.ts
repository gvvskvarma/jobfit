import { describe, expect, it } from "vitest";

import { formDraft } from "./evidence.server";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("formDraft", () => {
  it("splits tags and turns blank fields into nulls", () => {
    const r = formDraft(
      form({
        kind: "BULLET",
        text: "  Shipped the search page.  ",
        company: " ",
        tags: "React, , Performance ",
        start: "2021-03",
        end: "",
      }),
    );
    expect(r.success && r.data).toEqual({
      kind: "BULLET",
      text: "Shipped the search page.",
      company: null,
      project: null,
      tags: ["react", "performance"],
      start: "2021-03",
      end: null,
    });
  });

  it("rejects empty text, bad months and too many tags", () => {
    expect(formDraft(form({ kind: "BULLET", text: " " })).success).toBe(false);
    expect(
      formDraft(form({ kind: "BULLET", text: "x", start: "2021-13" })).success,
    ).toBe(false);
    expect(
      formDraft(form({ kind: "BULLET", text: "x", tags: "a,b,c,d,e,f,g" }))
        .success,
    ).toBe(false);
    expect(formDraft(form({ kind: "JOB", text: "x" })).success).toBe(false);
  });
});
