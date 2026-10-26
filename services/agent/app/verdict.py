"""decide_verdict and the report summary (SPEC 8.4). Deterministic, so the summary can
never say something the flags don't."""

from app.schemas import EmployerSignal, ScreenFlag, UserContext, Verdict

VERDICT_WORDS = {"apply": "Apply", "apply_with_caution": "Apply with caution", "skip": "Skip"}


def weak_employer(employer: EmployerSignal, user: UserContext) -> bool:
    if employer.transfer_likelihood in ("low", "unknown") or employer.willful_violator:
        return True
    if user.visa_status == "H1B" and employer.years:
        latest = employer.years[-1].fiscal_year
        return sum(y.transfers for y in employer.years if y.fiscal_year >= latest - 1) == 0
    return False


def decide_verdict(flags: list[ScreenFlag], employer: EmployerSignal, user: UserContext) -> Verdict:
    if any(f.severity == "block" for f in flags):
        return "skip"
    if any(f.severity == "warn" for f in flags) or weak_employer(employer, user):
        return "apply_with_caution"
    return "apply"


def summarize(verdict: Verdict, flags: list[ScreenFlag], employer: EmployerSignal) -> str:
    """Up to three sentences: the deciding reason, the employer record, and any upside."""
    by_severity = {s: [f for f in flags if f.severity == s] for s in ("block", "warn", "positive")}
    parts: list[str] = []
    if verdict == "skip":
        parts.append(f"Skip: {by_severity['block'][0].explanation}")
    elif by_severity["warn"]:
        parts.append(f"Apply with caution: {by_severity['warn'][0].explanation}")
    else:
        parts.append(f"{VERDICT_WORDS[verdict]}: nothing in the posting rules you out.")

    if not employer.matched:
        parts.append(
            "We couldn't match this employer to public H-1B records, so check its sponsorship "
            "history yourself."
        )
    elif employer.years:
        y = employer.years[-1]
        parts.append(
            f"{employer.employer} had {y.lca_certified:,} certified H-1B filings in "
            f"FY{y.fiscal_year}, "
            + (f"{y.transfers:,} of them transfers." if y.transfers else "none of them transfers.")
        )
    if verdict != "skip" and by_severity["positive"]:
        parts.append(by_severity["positive"][0].explanation)
    return " ".join(parts[:3])
