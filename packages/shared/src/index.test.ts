import { expect, test } from "vitest";

import { SCREENING_DISCLAIMER, VISA_CLOCK_DISCLAIMER } from "./index";

test("disclaimers say not legal advice", () => {
  for (const text of [SCREENING_DISCLAIMER, VISA_CLOCK_DISCLAIMER]) {
    expect(text.startsWith("Not legal advice.")).toBe(true);
  }
});
