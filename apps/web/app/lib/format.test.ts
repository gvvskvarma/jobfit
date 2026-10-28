import { expect, test } from "vitest";

import { bucketLabel, formatUsd, fyLabel, isPartial, plural } from "./format";

test("plural", () => {
  expect(plural(1, "transfer")).toBe("1 transfer");
  expect(plural(0, "transfer")).toBe("0 transfers");
  expect(plural(1204, "transfer")).toBe("1,204 transfers");
});

test("money and bucket labels", () => {
  expect(formatUsd(142000)).toBe("$142,000");
  expect(bucketLabel("devops/sre")).toBe("Devops/sre");
});

test("labels a partial fiscal year with the months it covers", () => {
  expect(fyLabel({ fiscalYear: 2026, coveredThrough: "2026-06-30" })).toBe(
    "FY2026 (Oct 2025 to Jun 2026)",
  );
  expect(fyLabel({ fiscalYear: 2025, coveredThrough: "2025-09-30" })).toBe(
    "FY2025",
  );
  expect(isPartial({ fiscalYear: 2024, coveredThrough: null })).toBe(false);
});
