"""Collect raw public data into data/raw/ and record SHA-256 checksums (SPEC 7.1 step 1).

DOL blocks automated downloads, so its files are downloaded once in a browser and dropped
into data/raw/. USCIS's archived yearly CSVs (FY2023 and earlier) are fetched here.
"""

import argparse
import hashlib
import json
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parents[3] / "data" / "raw"
MANIFEST = RAW / "manifest.json"
DOL_PAGE = "https://www.dol.gov/agencies/eta/foreign-labor/performance"
USCIS_ARCHIVE = "https://www.uscis.gov/sites/default/files/document/data/h1b_datahubexport-{fy}.csv"
USCIS_LAST_ARCHIVED_FY = 2023


def lca_files(fy: int) -> list[Path]:
    return sorted(RAW.glob(f"LCA_Disclosure_Data_FY{fy}_Q*.xlsx"))


def perm_files(fy: int) -> list[Path]:
    return sorted(RAW.glob(f"PERM_Disclosure_Data*FY{fy}*.xlsx"))


def uscis_files() -> list[Path]:
    return sorted(RAW.glob("uscis_h1b_FY*.csv"))


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_uscis(fy: int) -> Path | None:
    if fy > USCIS_LAST_ARCHIVED_FY:
        return None
    dest = RAW / f"uscis_h1b_FY{fy}.csv"
    if not dest.exists():
        urllib.request.urlretrieve(USCIS_ARCHIVE.format(fy=fy), dest)
    return dest


def source_url(path: Path) -> str:
    if path.name.startswith("uscis_h1b_FY"):
        fy = int(path.stem.removeprefix("uscis_h1b_FY"))
        return USCIS_ARCHIVE.format(fy=fy) if fy <= USCIS_LAST_ARCHIVED_FY else "manual export"
    return DOL_PAGE


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fy", type=int, nargs="+", required=True)
    years = parser.parse_args().fy
    RAW.mkdir(parents=True, exist_ok=True)

    missing = []
    for fy in years:
        fetch_uscis(fy)
        if len(lca_files(fy)) < 4:
            missing.append(f"FY{fy}: LCA_Disclosure_Data_FY{fy}_Q1..Q4.xlsx")
        if not perm_files(fy):
            missing.append(f"FY{fy}: every PERM_Disclosure_Data*FY{fy}*.xlsx file")

    files = [*uscis_files(), *(f for fy in years for f in (*lca_files(fy), *perm_files(fy)))]
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    for f in files:
        if f.name not in manifest:
            manifest[f.name] = {"url": source_url(f), "sha256": sha256(f)}
    MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True))
    print(f"{len(files)} files recorded in {MANIFEST}")

    if missing:
        print(f"\nDownload these from {DOL_PAGE} into {RAW}:")
        print("\n".join(f"  {m}" for m in missing))
        print("Quarters not yet published can be skipped; etl.publish loads whatever is present.")


if __name__ == "__main__":
    main()
