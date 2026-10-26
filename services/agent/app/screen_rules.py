"""Deterministic screening rules (SPEC 8.4). These run before, and can't be removed by,
the LLM step. Every pattern matches whole words; the evidence is the full sentence."""

import re
from dataclasses import dataclass

from app.schemas import (
    EmployerSignal,
    FlagCode,
    ParsedJD,
    ScreenFlag,
    Severity,
    UserContext,
)

IGNORE_CASE = re.IGNORECASE


@dataclass(frozen=True)
class PhraseRule:
    code: FlagCode
    severity: Severity
    explanation: str
    patterns: tuple[re.Pattern[str], ...]


def _p(*patterns: str, flags: int = IGNORE_CASE) -> tuple[re.Pattern[str], ...]:
    return tuple(re.compile(p, flags) for p in patterns)


SPONSOR = r"(visa |immigration |h-?1b |employment visa )?sponsor(ship)?"

PHRASE_RULES = [
    PhraseRule(
        "NO_SPONSORSHIP",
        "block",
        "The employer says it won't sponsor a visa.",
        _p(
            rf"\b(will|do|does|can|could|are|is)\s*(not|n't)\s+(be\s+)?(able to\s+)?"
            rf"(provide |offer |support )?(any )?{SPONSOR}\b",
            rf"\b(cannot|can't|won't|wont)\s+(provide |offer |support )?(any )?{SPONSOR}\b",
            rf"\bunable to (provide |offer |support )?(any )?{SPONSOR}\b",
            rf"\bno {SPONSOR}\b",
            rf"\bwithout (the need for |requiring )?(current or future )?{SPONSOR}\b",
            rf"\b{SPONSOR} (is |will )?not (be )?(available|offered|provided|supported)\b",
            rf"\bnot (eligible|available|able to offer) (for )?{SPONSOR}\b",
            r"\bnow or in the future\b.{0,40}\bsponsor",
            r"\bsponsor.{0,40}\bnow or in the future\b",
        ),
    ),
    PhraseRule(
        "CITIZEN_ONLY",
        "block",
        "The role is limited to US citizens.",
        _p(
            r"\bu\.?\s?s\.? citizens? only\b",
            r"\bonly (open to )?u\.?\s?s\.? citizens\b",
            r"\bmust be (a )?(u\.?\s?s\.?|united states) citizens?\b",
            r"\b(u\.?\s?s\.?|united states) citizenship (is )?required\b",
            r"\brequires? (u\.?\s?s\.?|united states) citizenship\b",
        ),
    ),
    PhraseRule(
        "GC_REQUIRED",
        "block",
        "The role is limited to US citizens and green card holders.",
        _p(
            r"\bgreen card holders? only\b",
            r"\bgc holders? only\b",
            r"\bu\.?s\.?c\.?\s*(/|or|and|&)\s*(gc|green card)\b",
            r"\b(u\.?\s?s\.? )?citizens? (or|and|/) "
            r"(permanent residents|green card holders)( only)?\b",
            r"\bmust (be|hold) (a )?(lawful )?(permanent resident|green card)\b",
        ),
    ),
    PhraseRule(
        "CLEARANCE",
        "block",
        "The role needs a US security clearance, which visa holders can't get.",
        _p(
            r"\b(security|secret|top secret|ts|dod|government) clearance\b",
            r"\bts\s?/\s?sci\b",
            r"\b(active|current|existing) clearance\b",
            r"\bclearance (is )?required\b",
            r"\bpublic trust (clearance|position|eligibility|background|level)\b",
            r"\bposition of (public )?trust\b",
        ),
    ),
    PhraseRule(
        "ITAR_EAR",
        "block",
        "Export-control rules (ITAR or EAR) limit this role to US persons.",
        _p(
            r"\bITAR\b",
            r"\bexport[- ]controll?ed\b",
            r"\bexport control (laws|regulations|requirements)\b",
            r"\bu\.?\s?s\.? persons?\b",
            r"\bwithout (additional |an )?export licens",
        )
        # Uppercase only, so "ear", "year" and "learn" never match.
        + _p(r"\bEAR\b", flags=0),
    ),
    PhraseRule(
        "C2C_ONLY",
        "warn",
        "The role is corp-to-corp: you'd be paid through a staffing company, not hired directly.",
        _p(r"\bc2c\b", r"\bcorp[- ]to[- ]corp\b"),
    ),
    PhraseRule(
        "W2_ONLY",
        "warn",
        "The role is W-2 only. Check whether the W-2 employer is the one who would sponsor.",
        _p(r"\bw-?2 only\b", r"\bonly w-?2\b", r"\bw-?2 (candidates|consultants) only\b"),
    ),
    PhraseRule(
        "CONTRACT",
        "warn",
        "This is a contract role, not a direct full-time hire.",
        _p(
            r"\bcontract (role|position|assignment|opportunity|engagement)\b",
            r"\bcontract[- ]to[- ]hire\b",
            r"\b\d+\+?[- ]?(month|mo)s?[- ](long )?contract\b",
            r"\b1099\b",
            r"\bcontractor (role|position)\b",
        ),
    ),
    PhraseRule(
        "RELOCATION",
        "warn",
        "You'd need to relocate for this role.",
        _p(
            r"\b(must|required to|willing(ness)? to) relocate\b",
            r"\brelocation (is )?required\b",
        ),
    ),
    PhraseRule(
        "SPONSORSHIP_OFFERED",
        "positive",
        "The employer says it sponsors visas.",
        _p(
            rf"\b{SPONSOR} (is )?(available|offered|provided|supported)\b",
            r"\b(will|willing to|can|happy to) sponsor\b",
            r"\bwe sponsor (visas|h-?1bs?)\b",
            rf"\b(offer|offers|provide|provides|support|supports) {SPONSOR}\b",
            r"\bopen to (candidates )?(who )?(require|need) (visa )?sponsorship\b",
        ),
    ),
    PhraseRule(
        "TRANSFER_OK",
        "positive",
        "The employer accepts H-1B transfers.",
        _p(r"\b(h-?1b|visa) transfers?\b"),
    ),
]

# A positive phrase right after a negation ("we cannot accept H-1B transfers") doesn't count.
_NEGATION = re.compile(r"\b(not|no|n't|cannot|unable|without)\b", IGNORE_CASE)
NEGATION_WINDOW = 40  # characters before the match
_CLAUSE_BREAK = re.compile(r"[,;:]|\bbut\b|\bhowever\b|\bwhile\b", IGNORE_CASE)

# Sentence ends that are really abbreviations: "U.S.", "e.g.", "Inc."
_ABBREVIATION = re.compile(r"(\b[A-Za-z]\.){1,3}$|\b(e\.g|i\.e|etc|Inc|Sr|Jr|No|vs|approx)\.$")


def sentences(text: str) -> list[str]:
    """Split a posting into sentences and bullet lines, keeping the original wording."""
    out: list[str] = []
    for line in text.splitlines():
        for chunk in re.split(r"\s*[•▪●]\s*", line):
            pending = ""
            for part in re.split(r"(?<=[.!?;])\s+", chunk.strip(" -*\t")):
                pending = f"{pending} {part}" if pending else part
                if not _ABBREVIATION.search(pending):
                    out.append(pending)
                    pending = ""
            if pending:
                out.append(pending)
    return [s for s in (s.strip() for s in out) if s]


def _matches(rule: PhraseRule, sentence: str) -> bool:
    for pattern in rule.patterns:
        if m := pattern.search(sentence):
            if rule.severity != "positive":
                return True
            before = sentence[max(0, m.start() - NEGATION_WINDOW) : m.start()]
            # Only the same clause counts: "unable to sponsor new visas, but H-1B transfers ...".
            clause = _CLAUSE_BREAK.split(before)[-1]
            if not _NEGATION.search(clause):
                return True
    return False


def phrase_flags(text: str) -> list[ScreenFlag]:
    """One flag per code, quoting the first sentence that triggers it."""
    flags: list[ScreenFlag] = []
    for rule in PHRASE_RULES:
        sentence = next((s for s in sentences(text) if _matches(rule, s)), None)
        if sentence:
            flags.append(
                ScreenFlag(
                    code=rule.code,
                    severity=rule.severity,
                    evidence=sentence,
                    explanation=rule.explanation,
                )
            )
    return flags


LOW_PAY_FLOOR = 60_000  # below this, an H-1B wage is unlikely to clear the prevailing wage


def annual(amount: int, unit: str | None) -> int:
    return amount * 2080 if unit == "hour" else amount


def context_flags(
    parsed: ParsedJD | None, employer: EmployerSignal, user: UserContext
) -> list[ScreenFlag]:
    """Flags that need the parsed posting, the employer's record or the user (SPEC 8.4)."""
    flags: list[ScreenFlag] = []
    pay = parsed and (parsed.pay_max or parsed.pay_min)
    if parsed and pay:
        posted = annual(pay, parsed.pay_unit)
        band = employer.wage_band
        evidence = next((s for s in parsed.raw_flags if "$" in s), f"Posted pay: ${posted:,}")
        if band and posted < band.p25:
            flags.append(
                ScreenFlag(
                    code="LOW_PAY",
                    severity="warn",
                    evidence=evidence,
                    explanation=f"The posted pay (${posted:,} a year) is below what this employer "
                    f"paid three quarters of its H-1B {band.title_bucket} hires "
                    f"(${band.p25:,}).",
                    source="data",
                )
            )
        elif posted < LOW_PAY_FLOOR:
            flags.append(
                ScreenFlag(
                    code="LOW_PAY",
                    severity="warn",
                    evidence=evidence,
                    explanation=f"The posted pay (${posted:,} a year) may be below the prevailing "
                    "wage an H-1B petition has to meet.",
                    source="data",
                )
            )
    if parsed and parsed.years_required and user.experience_years is not None:
        if parsed.years_required > user.experience_years + 2:
            flags.append(
                ScreenFlag(
                    code="SENIORITY_MISMATCH",
                    severity="warn",
                    evidence=f"Requires {parsed.years_required}+ years of experience.",
                    explanation=f"It asks for {parsed.years_required}+ years; your experience "
                    f"bank shows about {user.experience_years}.",
                    source="data",
                )
            )
    if user.visa_status == "STEM_OPT":
        flags.append(
            ScreenFlag(
                code="EVERIFY_CHECK",
                severity="info",
                evidence="STEM OPT requires an E-Verify employer.",
                explanation="Check the employer at https://www.e-verify.gov/e-verify-employers "
                "before you accept an offer.",
                source="data",
            )
        )
    if employer.cap_exempt_hint:
        flags.append(
            ScreenFlag(
                code="CAP_EXEMPT_HINT",
                severity="positive",
                evidence=f"{employer.employer} looks like a university or research institute.",
                explanation="It may be cap-exempt, so it could file an H-1B outside the lottery. "
                "Confirm with the employer.",
                source="data",
            )
        )
    return flags


def personalize(flags: list[ScreenFlag], user: UserContext) -> list[ScreenFlag]:
    """For someone already on an H-1B, "no sponsorship" plus "transfers OK" isn't a dead end."""
    codes = {f.code for f in flags}
    if user.visa_status != "H1B" or "TRANSFER_OK" not in codes:
        return flags
    return [
        f.model_copy(
            update={
                "severity": "warn",
                "explanation": "The employer won't sponsor a new visa but accepts H-1B "
                "transfers, which covers you. Confirm before applying.",
            }
        )
        if f.code == "NO_SPONSORSHIP"
        else f
        for f in flags
    ]
