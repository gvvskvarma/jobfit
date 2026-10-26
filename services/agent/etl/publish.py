"""Run the ETL for the given fiscal years and publish to Postgres in one transaction
(SPEC 7.1 steps 2-7). Re-running a year replaces that year's stats and wage bands."""

import argparse
import hashlib
import json
import os
import time
from pathlib import Path

import polars as pl
import psycopg

from etl import aggregate
from etl.download import MANIFEST, RAW, lca_files, perm_files, uscis_files
from etl.load_lca import load_lca
from etl.load_perm import load_perm
from etl.load_uscis import load_uscis

ENV_FILE = Path(__file__).resolve().parents[3] / ".env.local"


def build(years: list[int]) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    """Employers, per-year stats (with PERM and USCIS merged) and wage bands."""
    employers, stats, bands = [], [], []
    for fy in years:
        files = lca_files(fy)
        if not files:
            raise SystemExit(
                f"FY{fy}: no LCA files in {RAW}; run `python -m etl.download --fy {fy}`"
            )
        t = time.monotonic()
        lca = load_lca(files)
        year = aggregate.year_stats(lca, fy)
        if perm := perm_files(fy):
            year = year.join(load_perm(perm), on="employer", how="left")
        employers.append(aggregate.employers(lca))
        stats.append(year)
        bands.append(aggregate.wage_bands(lca, fy))
        print(f"FY{fy}: {lca.height:,} H-1B cases in {time.monotonic() - t:.0f}s")

    all_stats = pl.concat(stats, how="diagonal")
    for col in ("perm_total", "perm_certified"):
        if col not in all_stats.columns:
            all_stats = all_stats.with_columns(pl.lit(None, pl.Int64).alias(col))
    if uscis := uscis_files():
        # USCIS only attaches to employer-years we have LCA data for (SPEC 7.1 step 5).
        all_stats = all_stats.join(load_uscis(uscis), on=["employer", "fiscal_year"], how="left")
    else:
        all_stats = all_stats.with_columns(
            pl.lit(None, pl.Int64).alias(c)
            for c in (
                "initial_approvals",
                "initial_denials",
                "continuing_approvals",
                "continuing_denials",
            )
        )
    # The most recent year's display name and NAICS win.
    all_employers = pl.concat(reversed(employers)).unique("employer", keep="first")
    return all_employers, all_stats, pl.concat(bands)


def _copy(cur: psycopg.Cursor, table: str, df: pl.DataFrame) -> None:
    with cur.copy(f"COPY {table} ({', '.join(df.columns)}) FROM STDIN") as copy:
        for row in df.iter_rows():
            copy.write_row(row)


def publish(
    conn: psycopg.Connection,
    years: list[int],
    employers: pl.DataFrame,
    stats: pl.DataFrame,
    bands: pl.DataFrame,
    versions: list[tuple[str, int, str, str]],
) -> None:
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            "CREATE TEMP TABLE e (employer text, display_name text, naics text, aliases text[],"
            " cap_exempt_hint bool) ON COMMIT DROP"
        )
        _copy(
            cur,
            "e",
            employers.select("employer", "display_name", "naics", "aliases", "cap_exempt_hint"),
        )
        cur.execute(
            """INSERT INTO "Employer"
                 ("normalizedName", "displayName", naics, aliases, "capExemptHint")
               SELECT employer, display_name, naics, aliases, cap_exempt_hint FROM e
               ON CONFLICT ("normalizedName") DO UPDATE SET "displayName" = EXCLUDED."displayName",
                 naics = EXCLUDED.naics, aliases = EXCLUDED.aliases,
                 "capExemptHint" = EXCLUDED."capExemptHint" """
        )
        cur.execute('DELETE FROM "EmployerYearStats" WHERE "fiscalYear" = ANY(%s)', (years,))
        cur.execute('DELETE FROM "WageBand" WHERE "fiscalYear" = ANY(%s)', (years,))

        cur.execute(
            "CREATE TEMP TABLE s (employer text, fiscal_year int, lca_certified int, lca_total int,"
            " change_employer int, new_employment int, h1b_dependent bool, willful_violator bool,"
            " initial_approvals int, initial_denials int, continuing_approvals int,"
            " continuing_denials int, perm_total int, perm_certified int) ON COMMIT DROP"
        )
        _copy(
            cur,
            "s",
            stats.select(
                "employer",
                "fiscal_year",
                "lca_certified",
                "lca_total",
                "change_employer",
                "new_employment",
                "h1b_dependent",
                "willful_violator",
                "initial_approvals",
                "initial_denials",
                "continuing_approvals",
                "continuing_denials",
                "perm_total",
                "perm_certified",
            ),
        )
        cur.execute(
            """INSERT INTO "EmployerYearStats" ("employerId", "fiscalYear", "lcaCertified",
                 "lcaTotal", "changeEmployer", "newEmployment", "h1bDependent", "willfulViolator",
                 "uscisInitialApprovals", "uscisInitialDenials", "uscisContinuingApprovals",
                 "uscisContinuingDenials", "permTotal", "permCertified")
               SELECT emp.id, s.fiscal_year, s.lca_certified, s.lca_total, s.change_employer,
                 s.new_employment, s.h1b_dependent, s.willful_violator, s.initial_approvals,
                 s.initial_denials, s.continuing_approvals, s.continuing_denials, s.perm_total,
                 s.perm_certified
               FROM s JOIN "Employer" emp ON emp."normalizedName" = s.employer"""
        )

        cur.execute(
            "CREATE TEMP TABLE b (employer text, fiscal_year int, soc text, bucket text,"
            " worksite_state text, n int, change_employer int, p25 int, median int, p75 int)"
            " ON COMMIT DROP"
        )
        _copy(
            cur,
            "b",
            bands.select(
                "employer",
                "fiscal_year",
                "soc",
                "bucket",
                "worksite_state",
                "n",
                "change_employer",
                "p25",
                "median",
                "p75",
            ),
        )
        cur.execute(
            """INSERT INTO "WageBand" ("employerId", "fiscalYear", "socCode", "titleBucket",
                 "worksiteState", n, "changeEmployer", p25, median, p75)
               SELECT emp.id, b.fiscal_year, b.soc, b.bucket, b.worksite_state, b.n,
                 b.change_employer, b.p25, b.median, b.p75
               FROM b JOIN "Employer" emp ON emp."normalizedName" = b.employer"""
        )
        # Employers left with no stats in any year (e.g. after a normalization fix renamed them).
        cur.execute(
            """DELETE FROM "Employer" e WHERE NOT EXISTS
               (SELECT 1 FROM "EmployerYearStats" s WHERE s."employerId" = e.id)"""
        )
        cur.executemany(
            """INSERT INTO "DatasetVersion" (source, "fiscalYear", "sourceUrl", sha256)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (source, "fiscalYear") DO UPDATE SET "sourceUrl" = EXCLUDED."sourceUrl",
                 sha256 = EXCLUDED.sha256, "loadedAt" = now()""",
            versions,
        )


def dataset_versions(years: list[int]) -> list[tuple[str, int, str, str]]:
    """One row per source and year; sha256 covers every file that went into it."""
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}

    def row(source: str, fy: int, files: list[Path]) -> tuple[str, int, str, str]:
        entries = [manifest.get(f.name, {}) for f in files]
        digest = hashlib.sha256("".join(sorted(e.get("sha256", "") for e in entries)).encode())
        return source, fy, entries[0].get("url", "unknown"), digest.hexdigest()

    rows = []
    for fy in years:
        rows.append(row("LCA", fy, lca_files(fy)))
        if perm := perm_files(fy):
            rows.append(row("PERM", fy, perm))
        if uscis := [f for f in uscis_files() if f.name == f"uscis_h1b_FY{fy}.csv"]:
            rows.append(row("USCIS", fy, uscis))
    return rows


def load_env() -> None:
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text().splitlines():
        key, sep, value = line.partition("=")
        if sep and not key.startswith("#"):
            os.environ.setdefault(key.strip(), value.strip())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fy", type=int, nargs="+", required=True)
    years = parser.parse_args().fy
    load_env()
    start = time.monotonic()
    employers, stats, bands = build(years)
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        publish(conn, years, employers, stats, bands, dataset_versions(years))
    print(
        f"Published {employers.height:,} employers, {stats.height:,} employer-years and "
        f"{bands.height:,} wage bands in {time.monotonic() - start:.0f}s"
    )


if __name__ == "__main__":
    main()
