"""Run the golden set (SPEC 9) and enforce the CI gate.

    JOBFIT_LLM=replay uv run python -m evals.run_evals          # CI: recorded responses
    JOBFIT_LLM=record uv run python -m evals.run_evals          # re-record after prompt changes
    uv run python -m evals.run_evals --report                   # also write evals/report.md

Cases stub the employer record so verdicts don't depend on what's in the database;
lookup_employer has its own tests.
"""

import argparse
import os
import statistics
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import yaml

from app import llm, screen
from app.schemas import EmployerSignal, ScreeningReport, UserContext
from etl.publish import load_env

CASES = Path(__file__).with_name("cases")
REPORT = Path(__file__).with_name("report.md")
MIN_VERDICT_ACCURACY = 0.9
FULL_RECALL = ("ITAR_EAR", "NO_SPONSORSHIP")
MAX_P95_SECONDS = 8.0


def run_case(case: dict[str, Any]) -> tuple[ScreeningReport, float]:
    user = UserContext(**case.get("user", {"visa_status": "H1B"}))
    stub = EmployerSignal(**case["employer"]) if "employer" in case else None

    def employer(_conn: object, company: str | None, *_: object) -> EmployerSignal:
        return stub or EmployerSignal(employer=company, matched=False)

    screen.lookup_employer = employer  # type: ignore[assignment]
    screen.cached_parse = lambda _conn, text: llm.parse_jd(text)  # type: ignore[assignment]
    start = time.monotonic()
    report = screen.screen_job(None, case["jd"], user)  # type: ignore[arg-type]
    return report, time.monotonic() - start


def check(case: dict[str, Any], report: ScreeningReport) -> list[str]:
    expect = case["expect"]
    codes = {f.code for f in report.flags}
    problems = []
    if report.verdict != expect["verdict"]:
        problems.append(f"verdict {report.verdict}, expected {expect['verdict']}")
    problems += [f"missing {c}" for c in expect.get("must_flags", []) if c not in codes]
    problems += [f"false {c}" for c in expect.get("must_not_flags", []) if c in codes]
    parsed = report.parsed
    if (
        parsed
        and "employment_type" in expect
        and parsed.employment_type != expect["employment_type"]
    ):
        problems.append(f"employment_type {parsed.employment_type}")
    skills = (
        {s.lower() for s in (parsed.required_skills + parsed.preferred_skills)} if parsed else set()
    )
    problems += [
        f"skill {s} not extracted"
        for s in expect.get("required_skills_include", [])
        if s not in skills
    ]
    return problems


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", action="store_true", help="write evals/report.md")
    args = parser.parse_args()
    load_env()

    cases = [yaml.safe_load(p.read_text()) for p in sorted(CASES.glob("*.yaml"))]
    rows, latencies = [], []
    verdicts_ok = 0
    expected: dict[str, int] = defaultdict(int)
    caught: dict[str, int] = defaultdict(int)
    false_flags = 0
    for case in cases:
        try:
            report, seconds = run_case(case)
        except llm.LLMError as e:
            rows.append((case["id"], "error", str(e)))
            continue
        latencies.append(seconds)
        problems = check(case, report)
        verdicts_ok += report.verdict == case["expect"]["verdict"]
        codes = {f.code for f in report.flags}
        for code in case["expect"].get("must_flags", []):
            expected[code] += 1
            caught[code] += code in codes
        false_flags += sum(c in codes for c in case["expect"].get("must_not_flags", []))
        rows.append((case["id"], "pass" if not problems else "fail", "; ".join(problems)))

    accuracy = verdicts_ok / len(cases)
    recall = {code: caught[code] / n for code, n in sorted(expected.items())}
    live = os.environ.get("JOBFIT_LLM", "live") != "replay"
    p95 = statistics.quantiles(latencies, n=20)[-1] if live and len(latencies) > 1 else None

    lines = [
        "| Case | Result | Notes |",
        "|---|---|---|",
        *(f"| {i} | {r} | {n} |" for i, r, n in rows),
        "",
        f"Verdict accuracy: {accuracy:.0%} ({verdicts_ok}/{len(cases)})",
        "Recall: " + ", ".join(f"{c} {r:.0%}" for c, r in recall.items()),
        f"False flags: {false_flags}",
        f"p95 latency: {p95:.1f}s" if p95 is not None else "p95 latency: not measured (replay)",
    ]
    print("\n".join(lines))
    if args.report:
        REPORT.write_text("# Eval report\n\n" + "\n".join(lines) + "\n")

    failures = []
    if accuracy < MIN_VERDICT_ACCURACY:
        failures.append(f"verdict accuracy {accuracy:.0%} < {MIN_VERDICT_ACCURACY:.0%}")
    failures += [
        f"{c} recall {recall.get(c, 0):.0%} < 100%" for c in FULL_RECALL if recall.get(c, 0) < 1
    ]
    if false_flags:
        failures.append(f"{false_flags} false flags")
    if any(r == "error" for _, r, _ in rows):
        failures.append("cases errored")
    if p95 is not None and p95 > MAX_P95_SECONDS:
        failures.append(f"p95 {p95:.1f}s > {MAX_P95_SECONDS:.0f}s")
    if failures:
        print("\nGATE FAILED: " + "; ".join(failures))
        sys.exit(1)
    print("\nGate passed.")


if __name__ == "__main__":
    main()
