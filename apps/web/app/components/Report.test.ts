import type { ScreenFlag } from "@jobfit/shared";
import { expect, test } from "vitest";

import { evidenceSpans } from "./Report";

const flag = (evidence: string): ScreenFlag => ({
  code: "ITAR_EAR",
  severity: "block",
  evidence,
  explanation: "x",
  source: "rule",
});

test("evidence spans locate quoted sentences, skip missing and overlapping ones", () => {
  const text = "Intro. Must be a U.S. person. C2C only.";
  const spans = evidenceSpans(text, [
    flag("C2C only."),
    flag("Must be a U.S. person."),
    flag("STEM OPT requires an E-Verify employer."), // data flag: not in the posting
    flag("U.S. person."), // overlaps the second flag's sentence
  ]);
  expect(spans.map((s) => text.slice(s.start, s.end))).toEqual([
    "Must be a U.S. person.",
    "C2C only.",
  ]);
  expect(spans.map((s) => s.flag)).toEqual([1, 0]);
});
