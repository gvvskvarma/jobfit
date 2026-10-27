"""lookup_employer (SPEC 8.3): SQL only, no LLM."""

import re

import psycopg
from psycopg.rows import dict_row

from app.schemas import EmployerSignal, EmployerYear, WageBandSummary
from etl.normalize import normalize_employer, title_bucket

HIGH_TRANSFERS = 5
_STATE = re.compile(r",\s*([A-Z]{2})\b")


def state_of(location: str | None) -> str | None:
    """ "Austin, TX" -> "TX". The parse prompt asks for "City, ST"."""
    m = _STATE.search(location or "")
    return m.group(1) if m else None


def transfer_likelihood(
    years: list[EmployerYear], bucket_transfers: dict[int, int], latest_fy: int
) -> str:
    """SPEC 8.4. `bucket_transfers` maps fiscal year -> transfers for the posting's title bucket."""
    recent = [latest_fy, latest_fy - 1]
    if not any(y.lca_certified for y in years if y.fiscal_year > latest_fy - 3):
        return "low"
    if any(bucket_transfers.get(fy, 0) >= HIGH_TRANSFERS for fy in recent):
        return "high"
    return "medium"


def lookup_employer(
    conn: psycopg.Connection,
    company: str | None,
    job_title: str | None = None,
    location: str | None = None,
) -> EmployerSignal:
    if not company or not (key := normalize_employer(company)):
        return EmployerSignal(employer=company, matched=False)
    cur = conn.cursor(row_factory=dict_row)
    emp = cur.execute(
        """SELECT id, "displayName", "capExemptHint" FROM "Employer"
            WHERE "normalizedName" = %s OR %s = ANY(aliases) LIMIT 1""",
        (key, company.strip()),
    ).fetchone()
    # Partial years (the current year's cumulative file) would understate every employer.
    latest = cur.execute(
        """SELECT max("fiscalYear") AS fy FROM "DatasetVersion" WHERE source = 'LCA'
            AND ("coveredThrough" IS NULL OR "coveredThrough" >= make_date("fiscalYear", 9, 30))"""
    ).fetchone()
    if not emp or not latest or latest["fy"] is None:
        return EmployerSignal(employer=company, matched=False)
    latest_fy: int = latest["fy"]

    rows = cur.execute(
        """SELECT "fiscalYear", "lcaCertified", "changeEmployer", "permCertified",
                  "h1bDependent", "willfulViolator"
             FROM "EmployerYearStats" WHERE "employerId" = %s AND "fiscalYear" <= %s
            ORDER BY "fiscalYear" """,
        (emp["id"], latest_fy),
    ).fetchall()
    years = [
        EmployerYear(
            fiscal_year=r["fiscalYear"],
            lca_certified=r["lcaCertified"],
            transfers=r["changeEmployer"],
            perm_certified=r["permCertified"],
        )
        for r in rows
    ]
    bucket = title_bucket(job_title)
    by_year = cur.execute(
        """SELECT "fiscalYear" AS fy, sum("changeEmployer")::int AS transfers FROM "WageBand"
            WHERE "employerId" = %s AND "titleBucket" = %s AND "fiscalYear" <= %s GROUP BY 1""",
        (emp["id"], bucket, latest_fy),
    ).fetchall()
    state = state_of(location)
    # Closest pay group: same bucket, same state if we know it, largest group first.
    band = cur.execute(
        """SELECT "titleBucket", "worksiteState", n, p25, median, p75 FROM "WageBand"
            WHERE "employerId" = %s AND "fiscalYear" = %s AND "titleBucket" = %s
              AND median IS NOT NULL
            ORDER BY ("worksiteState" = %s) DESC, n DESC LIMIT 1""",
        (emp["id"], latest_fy, bucket, state or ""),
    ).fetchone()
    last = rows[-1] if rows else None
    perm = [y.perm_certified for y in years if y.fiscal_year >= latest_fy - 1]
    return EmployerSignal(
        employer=emp["displayName"],
        employer_id=emp["id"],
        matched=True,
        years=years,
        wage_band=WageBandSummary(
            title_bucket=band["titleBucket"],
            worksite_state=band["worksiteState"] or None,
            n=band["n"],
            p25=band["p25"],
            median=band["median"],
            p75=band["p75"],
        )
        if band
        else None,
        h1b_dependent=last["h1bDependent"] if last else None,
        willful_violator=last["willfulViolator"] if last else None,
        cap_exempt_hint=emp["capExemptHint"],
        perm_filings_last_2fy=sum(p or 0 for p in perm) if any(p is not None for p in perm) else 0,
        transfer_likelihood=transfer_likelihood(
            years, {r["fy"]: r["transfers"] for r in by_year}, latest_fy
        ),
    )
