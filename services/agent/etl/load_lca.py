"""Read DOL LCA disclosure files (SPEC 5.1, 7.1 step 2)."""

from collections.abc import Callable
from pathlib import Path

import polars as pl

from etl.normalize import normalize_employer, title_bucket

# Only what we aggregate. Attorney, preparer and contact-person fields are never read.
COLUMNS = [
    "CASE_NUMBER",
    "CASE_STATUS",
    "VISA_CLASS",
    "JOB_TITLE",
    "SOC_CODE",
    "NEW_EMPLOYMENT",
    "CHANGE_EMPLOYER",
    "EMPLOYER_NAME",
    "NAICS_CODE",
    "WORKSITE_STATE",
    "WAGE_RATE_OF_PAY_FROM",
    "WAGE_UNIT_OF_PAY",
    "H-1B_DEPENDENT",
    "WILLFUL_VIOLATOR",
]
ANNUAL_FACTOR = {"HOUR": 2080.0, "WEEK": 52.0, "BI-WEEKLY": 26.0, "MONTH": 12.0, "YEAR": 1.0}


def to_int(col: str) -> pl.Expr:
    return (
        pl.col(col)
        .str.replace_all(",", "")
        .cast(pl.Float64, strict=False)
        .fill_null(0)
        .cast(pl.Int64)
    )


def is_yes(col: str) -> pl.Expr:
    return pl.col(col).str.to_uppercase().str.starts_with("Y").fill_null(False)


def map_unique(col: str, fn: Callable[[str], str]) -> pl.Expr:
    """Apply a Python function once per distinct value instead of once per row."""
    return pl.col(col).map_batches(
        lambda s: s.replace_strict(
            {v: fn(v) for v in s.unique().to_list()}, return_dtype=pl.String
        ),
        return_dtype=pl.String,
    )


def load_lca(paths: list[Path]) -> pl.DataFrame:
    """One row per H-1B case. Files are read in name order (Q1..Q4); later files win on
    duplicate case numbers, which makes the result correct whether or not quarters overlap."""
    frames = [
        pl.read_excel(
            p,
            engine="calamine",
            columns=COLUMNS,
            schema_overrides=dict.fromkeys(COLUMNS, pl.String),
        )
        for p in sorted(paths)
    ]
    df = (
        pl.concat(frames)
        .filter(pl.col("VISA_CLASS") == "H-1B")
        .unique("CASE_NUMBER", keep="last", maintain_order=True)
    )
    factor = (
        pl.col("WAGE_UNIT_OF_PAY")
        .str.to_uppercase()
        .replace_strict(ANNUAL_FACTOR, default=None, return_dtype=pl.Float64)
    )
    wage = (
        pl.col("WAGE_RATE_OF_PAY_FROM").str.replace_all(r"[$,]", "").cast(pl.Float64, strict=False)
    )
    return df.select(
        employer=map_unique("EMPLOYER_NAME", normalize_employer),
        employer_raw=pl.col("EMPLOYER_NAME").str.strip_chars(),
        status=pl.col("CASE_STATUS"),
        naics=pl.col("NAICS_CODE"),
        soc=pl.col("SOC_CODE").fill_null(""),
        bucket=map_unique("JOB_TITLE", title_bucket),
        worksite_state=pl.col("WORKSITE_STATE").fill_null(""),
        new_employment=to_int("NEW_EMPLOYMENT"),
        change_employer=to_int("CHANGE_EMPLOYER"),
        annual_wage=wage * factor,
        h1b_dependent=is_yes("H-1B_DEPENDENT"),
        willful_violator=is_yes("WILLFUL_VIOLATOR"),
    ).filter(pl.col("employer") != "")
