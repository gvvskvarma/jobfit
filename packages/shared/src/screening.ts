import { z } from "zod";

// Mirrors services/agent/app/schemas.py (SPEC 8.1). tests/test_contract.py in the agent
// checks that the enums below match; change both files in the same PR.

export const FLAG_CODES = [
  "NO_SPONSORSHIP",
  "CITIZEN_ONLY",
  "CLEARANCE",
  "ITAR_EAR",
  "GC_REQUIRED",
  "C2C_ONLY",
  "W2_ONLY",
  "CONTRACT",
  "RELOCATION",
  "LOW_PAY",
  "SENIORITY_MISMATCH",
  "SPONSORSHIP_OFFERED",
  "TRANSFER_OK",
  "EVERIFY_CHECK",
  "CAP_EXEMPT_HINT",
  "WORK_AUTH_AMBIGUOUS",
] as const;
export const SEVERITIES = ["block", "warn", "info", "positive"] as const;
export const VERDICTS = ["apply", "apply_with_caution", "skip"] as const;
export const VISA_STATUSES = [
  "H1B",
  "OPT",
  "STEM_OPT",
  "L1",
  "GC_PENDING",
  "CITIZEN_OR_GC",
  "OTHER",
] as const;

export const ParsedJD = z.object({
  company: z.string().nullable(),
  title: z.string(),
  seniority: z.enum(["junior", "mid", "senior", "staff", "unknown"]),
  location: z.string().nullable(),
  work_model: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  employment_type: z.enum([
    "fte",
    "contract_w2",
    "contract_c2c",
    "contract_unknown",
    "unknown",
  ]),
  pay_min: z.number().int().nullable(),
  pay_max: z.number().int().nullable(),
  pay_unit: z.enum(["year", "hour"]).nullable(),
  required_skills: z.array(z.string()),
  preferred_skills: z.array(z.string()),
  years_required: z.number().int().nullable(),
  raw_flags: z.array(z.string()),
});

export const ScreenFlag = z.object({
  code: z.enum(FLAG_CODES),
  severity: z.enum(SEVERITIES),
  evidence: z.string(),
  explanation: z.string(),
  source: z.enum(["rule", "llm", "data"]),
});
export type ScreenFlag = z.infer<typeof ScreenFlag>;

export const EmployerSignal = z.object({
  employer: z.string().nullable(),
  employer_id: z.string().nullable(),
  matched: z.boolean(),
  years: z.array(
    z.object({
      fiscal_year: z.number().int(),
      lca_certified: z.number().int(),
      transfers: z.number().int(),
      perm_certified: z.number().int().nullable(),
    }),
  ),
  wage_band: z
    .object({
      title_bucket: z.string(),
      worksite_state: z.string().nullable(),
      n: z.number().int(),
      p25: z.number().int(),
      median: z.number().int(),
      p75: z.number().int(),
    })
    .nullable(),
  h1b_dependent: z.boolean().nullable(),
  willful_violator: z.boolean().nullable(),
  cap_exempt_hint: z.boolean(),
  perm_filings_last_2fy: z.number().int().nullable(),
  transfer_likelihood: z.enum(["high", "medium", "low", "unknown"]),
});

export const ScreeningReport = z.object({
  verdict: z.enum(VERDICTS),
  flags: z.array(ScreenFlag),
  employer: EmployerSignal,
  parsed: ParsedJD.nullable(),
  summary: z.string(),
  disclaimer: z.string(),
});
export type ScreeningReport = z.infer<typeof ScreeningReport>;

export const ScreenInput = z.object({
  jobText: z
    .string()
    .trim()
    .min(50, "Paste the full job description.")
    .max(30_000),
});
