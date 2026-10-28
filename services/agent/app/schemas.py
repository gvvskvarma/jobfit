"""The agent's contract (SPEC 8.1). Mirrored as Zod in packages/shared/src/screening.ts;
change both in the same PR."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field

SCREENING_DISCLAIMER = "Not legal advice. Confirm sponsorship with the employer."

FlagCode = Literal[
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
]
Severity = Literal["block", "warn", "info", "positive"]
Verdict = Literal["apply", "apply_with_caution", "skip"]
VisaStatus = Literal["H1B", "OPT", "STEM_OPT", "L1", "GC_PENDING", "CITIZEN_OR_GC", "OTHER"]


class ParsedJD(BaseModel):
    company: str | None
    title: str
    seniority: Literal["junior", "mid", "senior", "staff", "unknown"]
    location: str | None
    work_model: Literal["remote", "hybrid", "onsite", "unknown"]
    employment_type: Literal["fte", "contract_w2", "contract_c2c", "contract_unknown", "unknown"]
    pay_min: int | None
    pay_max: int | None
    pay_unit: Literal["year", "hour"] | None
    required_skills: list[str]
    preferred_skills: list[str]
    years_required: int | None
    raw_flags: list[str] = Field(
        description="Exact sentences about visas, sponsorship, location or contract terms."
    )


class ScreenFlag(BaseModel):
    code: FlagCode
    severity: Severity
    evidence: str = Field(description="A sentence quoted verbatim from the job posting.")
    explanation: str
    source: Literal["rule", "llm", "data"] = "rule"


class WageBandSummary(BaseModel):
    title_bucket: str
    worksite_state: str | None
    n: int
    p25: int
    median: int
    p75: int


class EmployerYear(BaseModel):
    fiscal_year: int
    lca_certified: int
    transfers: int
    perm_certified: int | None


class EmployerSignal(BaseModel):
    employer: str | None
    employer_id: str | None = None
    matched: bool
    years: list[EmployerYear] = []
    wage_band: WageBandSummary | None = None
    h1b_dependent: bool | None = None
    willful_violator: bool | None = None
    cap_exempt_hint: bool = False
    perm_filings_last_2fy: int | None = None
    transfer_likelihood: Literal["high", "medium", "low", "unknown"] = "unknown"


class ScreeningReport(BaseModel):
    verdict: Verdict
    flags: list[ScreenFlag]
    employer: EmployerSignal
    parsed: ParsedJD | None = None
    summary: str = Field(description="At most 3 sentences.")
    disclaimer: str = SCREENING_DISCLAIMER


class UserContext(BaseModel):
    """What the screen needs to know about the person reading the report."""

    visa_status: VisaStatus | None = None
    experience_years: int | None = None


EvidenceKind = Literal["BULLET", "PROJECT", "ACHIEVEMENT", "CERT", "EDUCATION"]
Month = Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


class EvidenceDraft(BaseModel):
    """One claim split out of an imported resume, shown for review before it's saved."""

    kind: EvidenceKind
    text: str = Field(min_length=1, max_length=1000)
    company: str | None = None
    project: str | None = None
    tags: list[str] = Field(default_factory=list, max_length=6)
    start: Month | None = None
    end: Month | None = None


class EvidenceHit(BaseModel):
    evidence_id: str
    text: str
    score: float
