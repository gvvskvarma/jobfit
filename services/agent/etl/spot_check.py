"""Recount LCA and PERM figures for well-known employers straight from the raw files and
compare them with the database (SPEC 7.4). Uses none of aggregate.py: rows are matched by
the exact legal names the employer filed under, and counted with plain filters."""

import argparse
import os
import sys

import polars as pl
import psycopg

from etl.download import lca_files, perm_files
from etl.normalize import normalize_employer
from etl.publish import load_env

DEFAULT = [
    "AMAZONCOM SERVICES",
    "COGNIZANT TECHNOLOGY SOLUTIONS",
    "ERNST AND YOUNG",
    "MICROSOFT",
    "GOOGLE",
    "TATA CONSULTANCY SERVICES",
    "APPLE",
    "META PLATFORMS",
    "INFOSYS",
    "JPMORGAN CHASE",
]


def raw_lca(fy: int) -> pl.DataFrame:
    cols = ["CASE_NUMBER", "CASE_STATUS", "VISA_CLASS", "EMPLOYER_NAME", "CHANGE_EMPLOYER"]
    frames = [
        pl.read_excel(f, engine="calamine", columns=cols).select(pl.all().cast(pl.String))
        for f in lca_files(fy)
    ]
    return (
        pl.concat(frames)
        .unique("CASE_NUMBER", keep="last", maintain_order=True)
        .filter(pl.col("VISA_CLASS") == "H-1B")
        .with_columns(pl.col("EMPLOYER_NAME").str.strip_chars())
    )


def raw_perm(fy: int) -> pl.DataFrame:
    frames = []
    for f in perm_files(fy):
        df = pl.read_excel(f, engine="calamine").select(pl.all().cast(pl.String))
        name = "EMP_BUSINESS_NAME" if "EMP_BUSINESS_NAME" in df.columns else "EMPLOYER_NAME"
        frames.append(df.select("CASE_NUMBER", "CASE_STATUS", pl.col(name).alias("EMPLOYER_NAME")))
    return pl.concat(frames).unique("CASE_NUMBER", keep="last")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fy", type=int, required=True)
    parser.add_argument("--employer", action="append", help="normalized name; repeatable")
    args = parser.parse_args()
    load_env()
    lca, perm = raw_lca(args.fy), raw_perm(args.fy)
    perm_keys = perm.with_columns(key=pl.col("EMPLOYER_NAME").map_elements(normalize_employer))

    failures = 0
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        for key in args.employer or DEFAULT:
            found = conn.execute(
                """SELECT e.aliases, s."lcaTotal", s."lcaCertified", s."changeEmployer",
                          s."permTotal", s."permCertified"
                     FROM "Employer" e JOIN "EmployerYearStats" s ON s."employerId" = e.id
                    WHERE e."normalizedName" = %s AND s."fiscalYear" = %s""",
                (key, args.fy),
            ).fetchone()
            if found is None:
                print(f"✗ {key}: not in the database")
                failures += 1
                continue
            aliases, *db = found
            rows = lca.filter(pl.col("EMPLOYER_NAME").is_in(aliases))
            cert = rows.filter(pl.col("CASE_STATUS") == "Certified")
            mine = perm_keys.filter(pl.col("key") == key)
            raw = [
                rows.height,
                cert.height,
                int(cert["CHANGE_EMPLOYER"].cast(pl.Float64).sum()),
                mine.height or None,
                mine.filter(pl.col("CASE_STATUS").str.starts_with("Certified")).height
                if mine.height
                else None,
            ]
            ok = raw == db
            failures += not ok
            print(f"{'✓' if ok else '✗'} {key}: raw {raw} db {db}")
    print("\nColumns: LCA total, LCA certified, transfers, PERM total, PERM certified")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
