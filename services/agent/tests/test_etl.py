from pathlib import Path

import polars as pl
import psycopg
import pytest

import etl.download
from etl.load_lca import COLUMNS
from etl.load_perm import load_perm
from etl.load_uscis import load_uscis
from etl.publish import build, dataset_versions, publish

FY = 1999  # a year real data never uses, so the DB test can't clobber real rows
ACME, UNI = "ZZTEST ACME", "ZZTEST STATE UNIVERSITY"


def lca_row(case: str, status: str, employer: str, **kw: str) -> dict[str, str]:
    row = dict.fromkeys(COLUMNS, "")
    row |= {
        "CASE_NUMBER": case,
        "CASE_STATUS": status,
        "VISA_CLASS": "H-1B",
        "JOB_TITLE": "Software Engineer",
        "SOC_CODE": "15-1252.00",
        "NEW_EMPLOYMENT": "0",
        "CHANGE_EMPLOYER": "0",
        "EMPLOYER_NAME": employer,
        "NAICS_CODE": "541511",
        "WORKSITE_STATE": "TX",
        "WAGE_RATE_OF_PAY_FROM": "100000",
        "WAGE_UNIT_OF_PAY": "Year",
        "H-1B_DEPENDENT": "N",
        "WILLFUL_VIOLATOR": "N",
    }
    return row | kw


@pytest.fixture
def raw(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    q1 = [
        lca_row("A1", "Certified", "ZZTest Acme Corp", CHANGE_EMPLOYER="2"),
        lca_row(
            "A2",
            "Certified",
            "ZZTEST ACME CORPORATION",
            NEW_EMPLOYMENT="1",
            WAGE_RATE_OF_PAY_FROM="$50.00",
            WAGE_UNIT_OF_PAY="Hour",
            JOB_TITLE="Senior Software Engineer",
            **{"H-1B_DEPENDENT": "Y"},
        ),
        lca_row("A3", "Denied", "ZZTest Acme Corp", CHANGE_EMPLOYER="5"),
        lca_row("A4", "Certified", "ZZTest Acme Corp", VISA_CLASS="E-3 Australian"),
    ]
    uni = [
        lca_row(
            f"U{i}",
            "Certified",
            "ZZTest State University",
            JOB_TITLE="Frontend Engineer",
            NAICS_CODE="611310",
            WAGE_RATE_OF_PAY_FROM=str(w),
            CHANGE_EMPLOYER="1",
        )
        for i, w in enumerate([80_000, 90_000, 100_000, 110_000, 120_000, 2_000_000])
    ]
    # A1 reappears in Q2 as withdrawn: the later file must win.
    q2 = [lca_row("A1", "Certified-Withdrawn", "ZZTest Acme Corp", CHANGE_EMPLOYER="2"), *uni]
    pl.DataFrame(q1).write_excel(tmp_path / f"LCA_Disclosure_Data_FY{FY}_Q1.xlsx")
    pl.DataFrame(q2).write_excel(tmp_path / f"LCA_Disclosure_Data_FY{FY}_Q2.xlsx")

    pl.DataFrame(
        {
            "CASE_NUMBER": ["P1", "P2"],
            "CASE_STATUS": ["Certified", "Denied"],
            "EMPLOYER_NAME": ["ZZTest Acme Corp", "ZZTest Acme Corp"],
        }
    ).write_excel(tmp_path / f"PERM_Disclosure_Data_FY{FY}_Q4.xlsx")
    pl.DataFrame(
        {
            "CASE_NUMBER": ["P3"],
            "CASE_STATUS": ["Certified-Expired"],
            "EMP_BUSINESS_NAME": ["ZZTEST ACME, INC."],
        }
    ).write_excel(tmp_path / f"PERM_Disclosure_Data_New_Form_FY{FY}_Q4.xlsx")

    (tmp_path / f"uscis_h1b_FY{FY}.csv").write_text(
        '"Fiscal Year",Employer,"Initial Approval","Initial Denial","Continuing Approval",'
        '"Continuing Denial",NAICS,"Tax ID",State,City,ZIP\n'
        f'{FY},"ZZTEST ACME CORP",3,1,"1,200",0,54,1234,TX,AUSTIN,78701\n'
        f'{FY},"ZZTEST ACME CORP",2,0,5,1,54,9999,WA,SEATTLE,98101\n'
    )
    monkeypatch.setattr(etl.download, "RAW", tmp_path)
    return tmp_path


def test_build_aggregates_one_year(raw: Path) -> None:
    employers, stats, bands = build([FY])

    acme = stats.filter(pl.col("employer") == ACME).row(0, named=True)
    # A1 was withdrawn in Q2, A3 denied, A4 is E-3: only A2 counts as certified.
    assert acme["lca_total"] == 3
    assert acme["lca_certified"] == 1
    assert acme["change_employer"] == 0
    assert acme["new_employment"] == 1
    assert acme["h1b_dependent"] is True
    assert (acme["perm_total"], acme["perm_certified"]) == (3, 2)
    assert (acme["initial_approvals"], acme["continuing_approvals"]) == (5, 1205)

    uni = employers.filter(pl.col("employer") == UNI).row(0, named=True)
    assert uni["cap_exempt_hint"] is True
    assert employers.filter(pl.col("employer") == ACME)["cap_exempt_hint"].item() is False

    band = bands.filter(pl.col("employer") == UNI).row(0, named=True)
    assert band["bucket"] == "frontend"
    assert band["n"] == 6
    assert band["change_employer"] == 6
    # The $2M outlier is excluded from the percentiles.
    assert (band["p25"], band["median"], band["p75"]) == (90_000, 100_000, 110_000)

    senior = bands.filter(pl.col("employer") == ACME).row(0, named=True)
    assert senior["bucket"] == "senior software engineer"
    assert senior["p25"] is None  # fewer than 5 wages


def test_perm_and_uscis_reject_unknown_headers(tmp_path: Path) -> None:
    pl.DataFrame({"CASE_NUMBER": ["P1"], "STATUS": ["Certified"]}).write_excel(tmp_path / "p.xlsx")
    with pytest.raises(ValueError, match="PERM header"):
        load_perm([tmp_path / "p.xlsx"])
    (tmp_path / "u.csv").write_text("Year,Company\n2023,X\n")
    with pytest.raises(ValueError, match="fiscal_year"):
        load_uscis([tmp_path / "u.csv"])


def test_publish_round_trip(raw: Path, db: psycopg.Connection) -> None:
    employers, stats, bands = build([FY])
    try:
        for _ in range(2):  # publishing twice must not duplicate rows
            publish(db, [FY], employers, stats, bands, dataset_versions([FY]))
        row = db.execute(
            """SELECT s."lcaCertified", s."permCertified", e."displayName"
               FROM "EmployerYearStats" s JOIN "Employer" e ON e.id = s."employerId"
               WHERE e."normalizedName" = %s AND s."fiscalYear" = %s""",
            (ACME, FY),
        ).fetchall()
        assert len(row) == 1
        assert row[0][:2] == (1, 2)
        bands_n = db.execute(
            'SELECT count(*) FROM "WageBand" WHERE "fiscalYear" = %s', (FY,)
        ).fetchone()
        assert bands_n == (bands.height,)
        sources = db.execute(
            'SELECT source FROM "DatasetVersion" WHERE "fiscalYear" = %s ORDER BY 1', (FY,)
        ).fetchall()
        assert [s for (s,) in sources] == ["LCA", "PERM", "USCIS"]
    finally:
        with db.transaction():
            db.execute("""DELETE FROM "Employer" WHERE "normalizedName" LIKE 'ZZTEST%'""")
            db.execute('DELETE FROM "DatasetVersion" WHERE "fiscalYear" = %s', (FY,))
