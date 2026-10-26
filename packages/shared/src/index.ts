import { z } from "zod";

// Must match the Pydantic defaults in services/agent/app/schemas.py (SPEC §8.1).
export const SCREENING_DISCLAIMER =
  "Not legal advice. Confirm sponsorship with the employer.";
export const VISA_CLOCK_DISCLAIMER =
  "Not legal advice. Confirm dates with your DSO or immigration attorney.";

// Must match the buckets in services/agent/etl/normalize.py (SPEC 7.3).
export const TITLE_BUCKETS = [
  "frontend",
  "full stack",
  "backend",
  "software engineer",
  "senior software engineer",
  "staff/principal",
  "data",
  "devops/sre",
  "mobile",
  "qa",
  "other",
] as const;

export const EmployerSearchQuery = z.object({
  q: z.string().trim().min(2).max(100),
});

export const DiscoverQuery = z.object({
  bucket: z.enum(TITLE_BUCKETS),
  state: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .transform((s) => s.toUpperCase())
    .optional(),
  fy: z.coerce.number().int().min(2000).max(2100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type DiscoverQuery = z.infer<typeof DiscoverQuery>;
