"""Aggregate one fiscal year of LCA rows (SPEC 7.1 step 4)."""

import polars as pl

MIN_WAGE, MAX_WAGE = 30_000, 1_000_000  # annualized outlier bounds (SPEC 7.4)
MIN_BAND_N = 5
CAP_EXEMPT_NAICS = "611310"  # colleges and universities (SPEC 5.4)
CAP_EXEMPT_WORDS = r"\b(UNIVERSITY|COLLEGE|RESEARCH INSTITUTE)\b"

CERTIFIED = pl.col("status") == "Certified"


def employers(lca: pl.DataFrame) -> pl.DataFrame:
    return (
        lca.group_by("employer")
        .agg(
            display_name=pl.col("employer_raw").mode().sort().first(),
            naics=pl.col("naics").drop_nulls().mode().sort().first(),
            aliases=pl.col("employer_raw").unique().sort().head(20),
        )
        .with_columns(
            cap_exempt_hint=pl.col("naics").str.starts_with(CAP_EXEMPT_NAICS).fill_null(False)
            | pl.col("employer").str.contains(CAP_EXEMPT_WORDS)
        )
    )


def year_stats(lca: pl.DataFrame, fiscal_year: int) -> pl.DataFrame:
    return (
        lca.group_by("employer")
        .agg(
            lca_total=pl.len(),
            lca_certified=CERTIFIED.sum(),
            change_employer=pl.col("change_employer").filter(CERTIFIED).sum(),
            new_employment=pl.col("new_employment").filter(CERTIFIED).sum(),
            h1b_dependent=pl.col("h1b_dependent").filter(CERTIFIED).any(),
            willful_violator=pl.col("willful_violator").filter(CERTIFIED).any(),
        )
        .with_columns(fiscal_year=pl.lit(fiscal_year))
    )


def wage_bands(lca: pl.DataFrame, fiscal_year: int) -> pl.DataFrame:
    valid = pl.col("annual_wage").is_between(MIN_WAGE, MAX_WAGE)
    wage = pl.col("annual_wage").filter(valid)
    enough = pl.col("valid_n") >= MIN_BAND_N
    return (
        lca.filter(CERTIFIED)
        .group_by("employer", "soc", "bucket", "worksite_state")
        .agg(
            n=pl.len(),
            change_employer=pl.col("change_employer").sum(),
            valid_n=valid.sum(),
            p25=wage.quantile(0.25, "linear"),
            median=wage.median(),
            p75=wage.quantile(0.75, "linear"),
        )
        .with_columns(
            pl.when(enough).then(pl.col(c).round().cast(pl.Int64)).alias(c)
            for c in ("p25", "median", "p75")
        )
        .drop("valid_n")
        .with_columns(fiscal_year=pl.lit(fiscal_year))
    )
