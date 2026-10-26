"""The screening pipeline (SPEC 8.2, up to decide_verdict):
parse_jd -> screen_rules -> employer_lookup -> screen_llm -> decide_verdict.
Plain functions for now; M4 wraps them as LangGraph nodes when interrupts arrive."""

import hashlib

import psycopg
from psycopg.types.json import Jsonb

from app import llm
from app.employer_lookup import lookup_employer
from app.schemas import ParsedJD, ScreeningReport, UserContext
from app.screen_rules import context_flags, personalize, phrase_flags
from app.verdict import decide_verdict, summarize

MAX_POSTING_CHARS = 30_000


def cache_key(text: str) -> str:
    parts = [" ".join(text.split()), llm.MODEL_FAST, llm.prompt("system"), llm.prompt("parse_jd")]
    return hashlib.sha256("\n".join(parts).encode()).hexdigest()


def cached_parse(conn: psycopg.Connection, text: str) -> ParsedJD:
    key = cache_key(text)
    row = conn.execute('SELECT parsed FROM "ParsedJdCache" WHERE hash = %s', (key,)).fetchone()
    if row:
        return ParsedJD.model_validate(row[0])
    parsed = llm.parse_jd(text)
    with conn.transaction():
        conn.execute(
            'INSERT INTO "ParsedJdCache" (hash, parsed) VALUES (%s, %s) ON CONFLICT DO NOTHING',
            (key, Jsonb(parsed.model_dump())),
        )
    return parsed


def screen_job(conn: psycopg.Connection, text: str, user: UserContext) -> ScreeningReport:
    if not text.strip():
        raise ValueError("The job posting is empty.")
    if len(text) > MAX_POSTING_CHARS:
        raise ValueError(f"The job posting is longer than {MAX_POSTING_CHARS:,} characters.")

    parsed = cached_parse(conn, text)
    employer = lookup_employer(conn, parsed.company, parsed.title, parsed.location)
    flags = personalize(phrase_flags(text) + context_flags(parsed, employer, user), user)
    # A rule already rules the job out: don't spend an LLM call (SPEC 8.2 short-circuit).
    if not any(f.severity == "block" for f in flags):
        flags += llm.screen_llm(text, parsed, flags, employer)

    verdict = decide_verdict(flags, employer, user)
    return ScreeningReport(
        verdict=verdict,
        flags=flags,
        employer=employer,
        parsed=parsed,
        summary=summarize(verdict, flags, employer),
    )
