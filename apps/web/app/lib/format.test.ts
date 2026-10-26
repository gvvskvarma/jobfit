import { expect, test } from "vitest";

import { bucketLabel, formatUsd, plural } from "./format";

test("plural", () => {
  expect(plural(1, "transfer")).toBe("1 transfer");
  expect(plural(0, "transfer")).toBe("0 transfers");
  expect(plural(1204, "transfer")).toBe("1,204 transfers");
});

test("money and bucket labels", () => {
  expect(formatUsd(142000)).toBe("$142,000");
  expect(bucketLabel("devops/sre")).toBe("Devops/sre");
});
