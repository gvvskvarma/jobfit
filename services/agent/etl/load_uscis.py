"""Read USCIS H-1B Employer Data Hub exports (SPEC 5.2). Columns differ by release, so
they're detected by header name, never by position."""

from pathlib import Path

import polars as pl

from etl.load_lca import map_unique, to_int
from etl.normalize import normalize_employer

# output name -> words the header must contain (case-insensitive)
FIELDS = {
    "fiscal_year": ("fiscal", "year"),
    "employer": ("employer",),
    "initial_approvals": ("initial", "approval"),
    "initial_denials": ("initial", "denial"),
    "continuing_approvals": ("continuing", "approval"),
    "continuing_denials": ("continuing", "denial"),
}


def _detect(header: list[str]) -> dict[str, str]:
    found = {}
    for field, words in FIELDS.items():
        matches = [h for h in header if all(w in h.lower() for w in words)]
        if len(matches) != 1:
            raise ValueError(f"USCIS header: expected one column for {field}, found {matches}")
        found[field] = matches[0]
    return found


def load_uscis(paths: list[Path]) -> pl.DataFrame:
    """Approvals and denials per normalized employer and fiscal year, summed across the
    employer's tax IDs and locations."""
    frames = []
    for path in paths:
        raw = pl.read_csv(path, infer_schema=False)
        cols = _detect(raw.columns)
        frames.append(raw.select(**{field: pl.col(src) for field, src in cols.items()}))
    df = pl.concat(frames)
    counts = [k for k in FIELDS if k not in ("fiscal_year", "employer")]
    return (
        df.with_columns(
            employer=map_unique("employer", normalize_employer),
            fiscal_year=to_int("fiscal_year"),
            **{c: to_int(c) for c in counts},
        )
        .filter(pl.col("employer") != "")
        .group_by("employer", "fiscal_year")
        .agg(pl.col(c).sum() for c in counts)
    )
