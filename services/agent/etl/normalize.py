"""Employer-name normalization and job-title buckets (SPEC 7.2, 7.3)."""

import re
from functools import cache
from pathlib import Path

import yaml

SUFFIXES = {
    "INC",
    "LLC",
    "CORP",
    "CORPORATION",
    "CO",
    "LTD",
    "LP",
    "LLP",
    "PLC",
    "USA",
    "US",
    "NA",
    "HOLDINGS",
    "GROUP",
    "INCORPORATED",
    "COMPANY",
    "LIMITED",
    "PC",
    "PLLC",
}

ALIASES_FILE = Path(__file__).with_name("aliases.yml")


@cache
def _aliases() -> dict[str, str]:
    """Map each alias's normalized form to its canonical normalized name."""
    raw = yaml.safe_load(ALIASES_FILE.read_text()) or {}
    return {_basic(alias): _basic(canon) for canon, aliases in raw.items() for alias in aliases}


def _basic(name: str) -> str:
    s = re.split(r"\s(?:D/B/A|DBA|DOING BUSINESS AS)\s", name.upper())[0]
    s = re.sub(r"\(.*?\)", " ", s)  # "(Formerly known as ...)"
    s = s.replace("&", " AND ")
    s = re.sub(r"[.,']", "", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    words = s.split()
    while len(words) > 1:
        if words[-1] in SUFFIXES or words[-1] == "AND":  # "JPMorgan Chase & Co." -> "... AND"
            words.pop()
        elif len(words) > 2 and words[-2:] == ["NORTH", "AMERICA"]:
            words = words[:-2]
        else:
            break
    return " ".join(words)


def normalize_employer(name: str | None) -> str:
    if not name:
        return ""
    basic = _basic(name)
    return _aliases().get(basic, basic)


_SENIOR = r"\b(senior|sr|lead)\b"

# Order matters: the first matching bucket wins, so specific roles come before generic ones.
_BUCKETS: list[tuple[str, re.Pattern[str]]] = [
    (b, re.compile(p, re.I))
    for b, p in [
        ("staff/principal", r"\b((?<!technical )staff|principal|distinguished|fellow)\b"),
        ("qa", r"\b(qa|quality assurance|sdet|tester|test (engineer|automation|analyst))\b"),
        (
            "devops/sre",
            r"\b(devops|dev ops|site reliability|sre|platform engineer|infrastructure engineer"
            r"|cloud (engineer|architect)|build engineer|release engineer)\b",
        ),
        (
            "data",
            r"\b(data (engineer|scientist|analyst|architect)|machine learning|ml engineer"
            r"|ai engineer|analytics engineer|etl|big data|data science)\b",
        ),
        ("mobile", r"\b(ios|android|mobile)\b"),
        ("frontend", r"\b(front[- ]?end|ui (engineer|developer)|react|angular|javascript)\b"),
        ("full stack", r"\bfull[- ]?stack\b"),
        ("backend", r"\b(back[- ]?end|server[- ]side)\b"),
        (
            "senior software engineer",
            rf"{_SENIOR}.*\b(software|application|applications)\b.*\b(engineer|developer)"
            r"|\b(software|application|applications)\b.*\b(engineer|developer)\s+(iii|iv)\b",
        ),
        (
            "software engineer",
            r"\b(software|application|applications|java|python|\.net|net|web)\b.*"
            r"\b(engineer|engineering|developer|development|programmer)\b"
            r"|\bsde\b|\bprogrammer\b|\bmember of technical staff\b",
        ),
    ]
]


# Used when the title says nothing specific ("Developer", "Senior Engineer"): the filing's
# federal occupation code still says what the job is.
_SOC_BUCKETS = {
    "15-1252": "software engineer",  # software developers
    "15-1253": "qa",  # software quality assurance analysts and testers
    "15-1254": "software engineer",  # web developers
    "15-1255": "frontend",  # web and digital interface designers
    "15-1242": "data",  # database administrators
    "15-1243": "data",  # database architects
    "15-2051": "data",  # data scientists
    "15-1244": "devops/sre",  # network and computer systems administrators
}


def title_bucket(title: str | None, soc: str | None = None) -> str:
    for bucket, pattern in _BUCKETS:
        if title and pattern.search(title):
            return bucket
    bucket = _SOC_BUCKETS.get((soc or "")[:7], "other")
    if bucket == "software engineer" and title and re.search(_SENIOR, title, re.I):
        return "senior software engineer"
    return bucket
