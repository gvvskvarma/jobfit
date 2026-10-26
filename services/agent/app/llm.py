"""The two LLM calls in screening: parse_jd and screen_llm (SPEC 8.1, 8.5).

JOBFIT_LLM controls where responses come from: "live" (default) calls Claude, "record"
calls Claude and saves each response under evals/fixtures/, "replay" only reads saved
responses, so CI evals cost nothing. Fixture keys include the prompt text, so editing a
prompt makes replay fail loudly until the fixtures are re-recorded.
"""

import hashlib
import json
import os
import re
from collections.abc import Callable
from functools import cache
from pathlib import Path

import anthropic
from pydantic import BaseModel, ValidationError

from app.schemas import EmployerSignal, FlagCode, ParsedJD, ScreenFlag, Severity

PROMPTS = Path(__file__).with_name("prompts")
FIXTURES = Path(__file__).resolve().parents[1] / "evals" / "fixtures"
MODEL_FAST = os.environ.get("MODEL_FAST", "claude-haiku-5-5")


class LLMError(RuntimeError):
    """The model refused, or its output didn't validate twice. Screening fails closed."""


class LlmFlag(BaseModel):
    code: FlagCode
    severity: Severity
    evidence: str
    explanation: str


class LlmFlags(BaseModel):
    flags: list[LlmFlag]


@cache
def prompt(name: str) -> str:
    return (PROMPTS / f"{name}.md").read_text()


@cache
def client() -> anthropic.Anthropic:
    return anthropic.Anthropic(timeout=20.0)


def wrap_posting(text: str) -> str:
    # A posting can't close the tag early and smuggle text outside it.
    safe = re.sub(r"</?\s*job_posting\s*>", "[tag removed]", text, flags=re.I)
    return f"<job_posting>\n{safe}\n</job_posting>"


def _call[T: BaseModel](task: str, user: str, schema: type[T]) -> T:
    system = [
        {
            "type": "text",
            "text": f"{prompt('system')}\n\n{prompt(task)}",
            "cache_control": {"type": "ephemeral"},
        }
    ]
    content = user
    for _ in range(2):
        try:
            response = client().messages.parse(
                model=MODEL_FAST,
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": content}],
                output_format=schema,
                output_config={"effort": "low"},
            )
        except ValidationError as e:
            content = f"{user}\n\nA previous answer failed validation: {e}. Follow the schema."
            continue
        if response.stop_reason == "refusal":
            raise LLMError(f"{task}: model refused")
        if response.parsed_output is not None:
            return response.parsed_output
        content = f"{user}\n\nA previous answer was cut off or empty. Follow the schema."
    raise LLMError(f"{task}: no valid output after a retry")


def recorded[T: BaseModel](task: str, user: str, schema: type[T], call: Callable[[], T]) -> T:
    mode = os.environ.get("JOBFIT_LLM", "live")
    if mode == "live":
        return call()
    key = hashlib.sha256(
        "\n".join([task, MODEL_FAST, prompt("system"), prompt(task), user]).encode()
    ).hexdigest()[:16]
    path = FIXTURES / f"{task}-{key}.json"
    if mode == "replay":
        if not path.exists():
            raise LLMError(f"no recorded response {path.name}; run with JOBFIT_LLM=record")
        return schema.model_validate_json(path.read_text())
    result = call()
    FIXTURES.mkdir(parents=True, exist_ok=True)
    path.write_text(result.model_dump_json(indent=2) + "\n")
    return result


def parse_jd(text: str) -> ParsedJD:
    user = wrap_posting(text)
    return recorded("parse_jd", user, ParsedJD, lambda: _call("parse_jd", user, ParsedJD))


def _normalize(s: str) -> str:
    return " ".join(s.split()).lower()


def screen_llm(
    text: str, parsed: ParsedJD, rule_flags: list[ScreenFlag], employer: EmployerSignal
) -> list[ScreenFlag]:
    context = json.dumps(
        {
            "parsed": parsed.model_dump(),
            "rule_flags": [f.model_dump(include={"code", "evidence"}) for f in rule_flags],
            "employer": employer.model_dump(include={"employer", "matched", "transfer_likelihood"}),
        },
        sort_keys=True,
    )
    user = f"{wrap_posting(text)}\n\n<context>\n{context}\n</context>"
    out = recorded("screen_llm", user, LlmFlags, lambda: _call("screen_llm", user, LlmFlags))
    return accept_llm_flags(text, rule_flags, out.flags)


def accept_llm_flags(
    text: str, rule_flags: list[ScreenFlag], candidates: list[LlmFlag]
) -> list[ScreenFlag]:
    """Keep only new codes whose evidence is a verbatim quote from the posting (SPEC 8.4)."""
    seen = {f.code for f in rule_flags}
    posting = _normalize(text)
    accepted = []
    for c in candidates:
        if c.code in seen or not c.evidence.strip() or _normalize(c.evidence) not in posting:
            continue
        seen.add(c.code)
        accepted.append(ScreenFlag(**c.model_dump(), source="llm"))
    return accepted
