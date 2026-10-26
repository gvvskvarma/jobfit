import pytest

from app.schemas import EmployerSignal, ParsedJD, UserContext, WageBandSummary
from app.screen_rules import context_flags, personalize, phrase_flags, sentences

# code -> (sentences that must flag, sentences that must not)
CASES: dict[str, tuple[list[str], list[str]]] = {
    "NO_SPONSORSHIP": (
        [
            "We will not sponsor visas for this position.",
            "Unable to sponsor H-1B at this time.",
            "No sponsorship is available.",
            "We are not able to provide sponsorship.",
            "Must be authorized to work in the US without sponsorship now or in the future.",
            "We don't offer visa sponsorship.",
            "The company won't sponsor.",
            "Visa sponsorship is not available for this role.",
        ],
        [
            "We offer visa sponsorship for qualified candidates.",
            "Sponsorship available.",
            "This role is open to candidates who need sponsorship.",
            "We sponsor H-1Bs and green cards.",
        ],
    ),
    "CITIZEN_ONLY": (
        [
            "U.S. citizens only.",
            "Must be a US citizen.",
            "Due to federal contract requirements, candidates must be U.S. citizens.",
            "United States citizenship is required.",
            "This position requires U.S. citizenship.",
        ],
        [
            "We value good citizenship in our community.",
            "Help citizens access public services online.",
            "Open to all candidates authorized to work in the US.",
        ],
    ),
    "GC_REQUIRED": (
        [
            "Green card holders only.",
            "USC/GC only, no third parties.",
            "Open to US citizens or permanent residents only.",
            "Must hold a green card.",
        ],
        [
            "We support green card sponsorship after one year.",
            "Benefits include a green card process for eligible employees.",
            "We gave away green cards at the hackathon",
        ],
    ),
    "CLEARANCE": (
        [
            "Active Secret clearance required.",
            "Candidates must hold a TS/SCI.",
            "This is a Public Trust position.",
            "Must be able to obtain a DoD clearance.",
            "This role is a position of trust.",
        ],
        [
            "Join our clearance sale team.",
            "We work hard to earn the public trust.",
            "Customs clearance experience is a plus for logistics software.",
        ],
    ),
    "ITAR_EAR": (
        [
            "This position requires access to ITAR-controlled data.",
            "Applicants must be U.S. persons as defined by export regulations.",
            "The work involves export-controlled technology.",
            "This role is subject to EAR.",
            "We cannot share data without additional export licensing.",
        ],
        [
            "5+ years of experience required.",
            "You love to learn new things.",
            "Keep an ear to the ground for user feedback.",
            "YEARS OF EXPERIENCE: 5",
            "We are near downtown Austin.",
        ],
    ),
    "C2C_ONLY": (
        ["C2C only.", "Corp-to-corp candidates welcome.", "Rate: $70/hr on C2C."],
        ["Build B2C and B2B products.", "We are a C-corp.", "Customer to customer marketplace."],
    ),
    "W2_ONLY": (
        ["W2 only, no C2C.", "Only W-2 candidates.", "W2 candidates only please."],
        ["Fill out your W-4 on day one.", "We are a Web 2.0 company.", "W2 and C2C both accepted."],
    ),
    "CONTRACT": (
        [
            "This is a 6-month contract.",
            "Contract-to-hire opportunity.",
            "This is a contract position.",
            "1099 engagement.",
        ],
        [
            "Experience with smart contract development.",
            "You will support contract negotiation workflows.",
            "Work with our contracts team on renewals.",
        ],
    ),
    "RELOCATION": (
        ["Must relocate to Seattle.", "Relocation is required.", "Willingness to relocate."],
        [
            "Relocation assistance is not offered for remote roles.",
            "We help families settle in.",
            "Relocated our data center last year.",
        ],
    ),
    "SPONSORSHIP_OFFERED": (
        [
            "Visa sponsorship available.",
            "We will sponsor H-1B for the right candidate.",
            "We sponsor visas.",
            "We are happy to sponsor.",
            "We offer visa sponsorship and support H-1B transfers.",
        ],
        [
            "Sponsorship is not available.",
            "We will not sponsor.",
            "No sponsorship available.",
            "We cannot sponsor at this time.",
            "We do not offer visa sponsorship.",
        ],
    ),
    "TRANSFER_OK": (
        [
            "H-1B transfers welcome.",
            "Visa transfers only.",
            "We accept H1B transfer candidates.",
            "We are unable to sponsor new visas, but H-1B transfers are welcome.",
        ],
        [
            "We cannot accept H-1B transfers.",
            "No visa transfers.",
            "Transfer learning experience is a plus.",
        ],
    ),
}


@pytest.mark.parametrize(
    ("code", "sentence"),
    [(code, s) for code, (positives, _) in CASES.items() for s in positives],
)
def test_rule_flags(code: str, sentence: str) -> None:
    flags = {f.code: f for f in phrase_flags(sentence)}
    assert code in flags, f"{code} missed: {sentence!r}"
    assert flags[code].evidence == sentence


@pytest.mark.parametrize(
    ("code", "sentence"),
    [(code, s) for code, (_, negatives) in CASES.items() for s in negatives],
)
def test_rule_ignores(code: str, sentence: str) -> None:
    assert code not in {f.code for f in phrase_flags(sentence)}, f"false {code}: {sentence!r}"


def test_evidence_is_the_whole_sentence_from_a_posting() -> None:
    jd = (
        "Senior Frontend Engineer\n"
        "We build tools for logistics teams. Must be a U.S. citizen due to customer contracts.\n"
        "• 5+ years of React • Strong TypeScript"
    )
    (flag,) = [f for f in phrase_flags(jd) if f.code == "CITIZEN_ONLY"]
    assert flag.evidence == "Must be a U.S. citizen due to customer contracts."
    assert flag.evidence in jd


def test_sentences_keep_abbreviations_and_bullets() -> None:
    assert sentences("Must be a U.S. citizen. Perks, e.g. 401k.\n• React • Node") == [
        "Must be a U.S. citizen.",
        "Perks, e.g. 401k.",
        "React",
        "Node",
    ]


def parsed(**kw: object) -> ParsedJD:
    base: dict[str, object] = dict(
        company="Acme",
        title="Frontend Engineer",
        seniority="mid",
        location="Austin, TX",
        work_model="hybrid",
        employment_type="fte",
        pay_min=None,
        pay_max=None,
        pay_unit=None,
        required_skills=[],
        preferred_skills=[],
        years_required=None,
        raw_flags=[],
    )
    return ParsedJD.model_validate(base | kw)


BAND = WageBandSummary(
    title_bucket="frontend", worksite_state="TX", n=40, p25=120_000, median=138_000, p75=155_000
)


def codes(flags: list) -> set[str]:
    return {f.code for f in flags}


def test_low_pay_against_the_employers_band() -> None:
    employer = EmployerSignal(employer="Acme", matched=True, wage_band=BAND)
    low = parsed(pay_min=90_000, pay_max=110_000, pay_unit="year")
    assert "LOW_PAY" in codes(context_flags(low, employer, UserContext()))
    fine = parsed(pay_min=120_000, pay_max=150_000, pay_unit="year")
    assert "LOW_PAY" not in codes(context_flags(fine, employer, UserContext()))


def test_low_pay_hourly_without_a_band() -> None:
    unmatched = EmployerSignal(employer=None, matched=False)
    hourly = parsed(pay_min=25, pay_max=28, pay_unit="hour")  # $58,240 a year
    assert "LOW_PAY" in codes(context_flags(hourly, unmatched, UserContext()))
    ok = parsed(pay_min=60, pay_max=70, pay_unit="hour")
    assert "LOW_PAY" not in codes(context_flags(ok, unmatched, UserContext()))
    assert "LOW_PAY" not in codes(context_flags(parsed(), unmatched, UserContext()))


def test_seniority_only_with_known_experience() -> None:
    unmatched = EmployerSignal(employer=None, matched=False)
    senior = parsed(years_required=8)
    assert "SENIORITY_MISMATCH" in codes(
        context_flags(senior, unmatched, UserContext(experience_years=3))
    )
    assert "SENIORITY_MISMATCH" not in codes(
        context_flags(senior, unmatched, UserContext(experience_years=6))
    )
    assert "SENIORITY_MISMATCH" not in codes(context_flags(senior, unmatched, UserContext()))


def test_everify_and_cap_exempt() -> None:
    uni = EmployerSignal(employer="State University", matched=True, cap_exempt_hint=True)
    flags = context_flags(parsed(), uni, UserContext(visa_status="STEM_OPT"))
    assert {"EVERIFY_CHECK", "CAP_EXEMPT_HINT"} <= codes(flags)
    assert "EVERIFY_CHECK" not in codes(
        context_flags(parsed(), uni, UserContext(visa_status="H1B"))
    )


def test_transfer_ok_softens_no_sponsorship_for_h1b_holders_only() -> None:
    flags = phrase_flags("We do not sponsor new visas. H-1B transfers welcome.")
    assert {f.code: f.severity for f in flags}["NO_SPONSORSHIP"] == "block"
    h1b = {f.code: f.severity for f in personalize(flags, UserContext(visa_status="H1B"))}
    assert h1b["NO_SPONSORSHIP"] == "warn"
    opt = {f.code: f.severity for f in personalize(flags, UserContext(visa_status="OPT"))}
    assert opt["NO_SPONSORSHIP"] == "block"
