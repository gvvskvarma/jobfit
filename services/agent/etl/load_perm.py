"""Read DOL PERM disclosure files (SPEC 5.3). Column names changed with the June 2023
form, so they're detected by header."""

from pathlib import Path

import fastexcel
import polars as pl

from etl.load_lca import map_unique
from etl.normalize import normalize_employer

NAME_COLUMNS = ("EMP_BUSINESS_NAME", "EMPLOYER_NAME")
CERTIFIED = ("CERTIFIED", "CERTIFIED-EXPIRED")


def _read(path: Path) -> pl.DataFrame:
    header = [
        c.name for c in fastexcel.read_excel(path).load_sheet(0, n_rows=0).available_columns()
    ]
    name = next((c for c in NAME_COLUMNS if c in header), None)
    if name is None or "CASE_STATUS" not in header or "CASE_NUMBER" not in header:
        raise ValueError(f"{path.name}: unrecognized PERM header")
    cols = ["CASE_NUMBER", "CASE_STATUS", name]
    df = pl.read_excel(
        path, engine="calamine", columns=cols, schema_overrides=dict.fromkeys(cols, pl.String)
    )
    return df.rename({name: "EMPLOYER_NAME"})


def load_perm(paths: list[Path]) -> pl.DataFrame:
    """PERM filings per normalized employer: perm_total, perm_certified."""
    df = pl.concat([_read(p) for p in sorted(paths)]).unique("CASE_NUMBER", keep="last")
    return (
        df.with_columns(employer=map_unique("EMPLOYER_NAME", normalize_employer))
        .filter(pl.col("employer") != "")
        .group_by("employer")
        .agg(
            perm_total=pl.len(),
            perm_certified=pl.col("CASE_STATUS").str.to_uppercase().is_in(CERTIFIED).sum(),
        )
    )
