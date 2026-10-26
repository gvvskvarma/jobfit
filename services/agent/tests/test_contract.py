"""The Zod mirror in packages/shared must list the same enums as the Pydantic contract."""

import re
from pathlib import Path
from typing import get_args

import pytest

from app.schemas import SCREENING_DISCLAIMER, FlagCode, Severity, Verdict, VisaStatus

SHARED = Path(__file__).resolve().parents[3] / "packages" / "shared" / "src"


def ts_const(name: str) -> list[str]:
    source = (SHARED / "screening.ts").read_text()
    m = re.search(rf"export const {name} = \[(.*?)\] as const", source, re.S)
    assert m, f"{name} not found in screening.ts"
    return re.findall(r'"([^"]+)"', m.group(1))


@pytest.mark.parametrize(
    ("ts_name", "py_type"),
    [
        ("FLAG_CODES", FlagCode),
        ("SEVERITIES", Severity),
        ("VERDICTS", Verdict),
        ("VISA_STATUSES", VisaStatus),
    ],
)
def test_enums_match(ts_name: str, py_type: object) -> None:
    assert ts_const(ts_name) == list(get_args(py_type))


def test_disclaimer_matches() -> None:
    assert f'"{SCREENING_DISCLAIMER}"' in (SHARED / "index.ts").read_text()
