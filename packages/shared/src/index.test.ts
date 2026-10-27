import { expect, test } from "vitest";

import {
  SCREENING_DISCLAIMER,
  ScreenInput,
  VISA_CLOCK_DISCLAIMER,
} from "./index";

test("disclaimers say not legal advice", () => {
  for (const text of [SCREENING_DISCLAIMER, VISA_CLOCK_DISCLAIMER]) {
    expect(text.startsWith("Not legal advice.")).toBe(true);
  }
});

test("job links must be http(s), since they become an href", () => {
  const jobText = "x".repeat(60);
  const ok = (jobUrl: string) =>
    ScreenInput.safeParse({ jobText, jobUrl }).success;
  expect(ok("https://jobs.example.com/123")).toBe(true);
  expect(ok("")).toBe(true);
  expect(ok("javascript:alert(1)")).toBe(false);
  expect(ok("ftp://example.com")).toBe(false);
});
