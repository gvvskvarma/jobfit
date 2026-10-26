import pytest

from etl.normalize import normalize_employer, title_bucket


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Google LLC", "GOOGLE"),
        ("GOOGLE L.L.C.", "GOOGLE"),
        ("Amazon.com Services LLC", "AMAZONCOM SERVICES"),
        ("Microsoft Corporation", "MICROSOFT"),
        ("Bank of America, N.A.", "BANK OF AMERICA"),
        ("Tata Consultancy Services Limited", "TATA CONSULTANCY SERVICES"),
        ("Infosys Ltd.", "INFOSYS"),
        ("Deloitte Consulting LLP", "DELOITTE CONSULTING"),
        ("AT&T Services, Inc.", "AT AND T SERVICES"),
        ("Siemens Holdings USA Corp", "SIEMENS"),
        ("Toyota Motor North America, Inc.", "TOYOTA MOTOR"),
        ("0965688 BC LTD DBA PROCOGIA", "0965688 BC"),
        ("JPMorgan Chase & Co.", "JPMORGAN CHASE"),
        ("Johnson & Johnson", "JOHNSON AND JOHNSON"),
        ("Fidelity Technology Group, LLC d/b/a Fidelity Investments", "FIDELITY TECHNOLOGY"),
        ("Fidelity Technology Group, LLC", "FIDELITY TECHNOLOGY"),
        ("Ascendion, Inc. (Formerly known as Collabera, Inc.)", "ASCENDION"),
        ("Facebook, Inc.", "META PLATFORMS"),
        ("Meta Platforms, Inc.", "META PLATFORMS"),
        ("Group", "GROUP"),
        ("", ""),
        (None, ""),
    ],
)
def test_normalize_employer(raw: str | None, expected: str) -> None:
    assert normalize_employer(raw) == expected


TITLES = [
    ("Software Engineer", "software engineer"),
    ("Software Developer", "software engineer"),
    ("Software Development Engineer II", "software engineer"),
    ("SDE II", "software engineer"),
    ("Member of Technical Staff", "software engineer"),
    ("Application Developer", "software engineer"),
    ("Java Developer", "software engineer"),
    ("Python Developer", "software engineer"),
    (".NET Developer", "software engineer"),
    ("Programmer Analyst", "software engineer"),
    ("Computer Programmer", "software engineer"),
    ("Senior Software Engineer", "senior software engineer"),
    ("Sr. Software Engineer", "senior software engineer"),
    ("Software Engineer III", "senior software engineer"),
    ("Lead Software Developer", "senior software engineer"),
    ("Senior Applications Developer", "senior software engineer"),
    ("Staff Software Engineer", "staff/principal"),
    ("Principal Engineer", "staff/principal"),
    ("Distinguished Engineer", "staff/principal"),
    ("Frontend Engineer", "frontend"),
    ("Front-End Developer", "frontend"),
    ("Senior Front End Engineer", "frontend"),
    ("UI Developer", "frontend"),
    ("React Developer", "frontend"),
    ("Angular Developer", "frontend"),
    ("Full Stack Engineer", "full stack"),
    ("Full-Stack Developer", "full stack"),
    ("Senior Fullstack Software Engineer", "full stack"),
    ("Backend Engineer", "backend"),
    ("Back-End Developer", "backend"),
    ("Server-Side Engineer", "backend"),
    ("Data Engineer", "data"),
    ("Senior Data Scientist", "data"),
    ("Machine Learning Engineer", "data"),
    ("Data Analyst", "data"),
    ("ETL Developer", "data"),
    ("Big Data Engineer", "data"),
    ("DevOps Engineer", "devops/sre"),
    ("Site Reliability Engineer", "devops/sre"),
    ("SRE II", "devops/sre"),
    ("Cloud Engineer", "devops/sre"),
    ("Platform Engineer", "devops/sre"),
    ("iOS Engineer", "mobile"),
    ("Android Developer", "mobile"),
    ("Mobile Application Developer", "mobile"),
    ("QA Engineer", "qa"),
    ("Quality Assurance Analyst", "qa"),
    ("SDET", "qa"),
    ("Test Automation Engineer", "qa"),
    ("Business Analyst", "other"),
    ("Accountant", "other"),
    ("Physical Therapist", "other"),
]


@pytest.mark.parametrize(("title", "bucket"), TITLES)
def test_title_bucket(title: str, bucket: str) -> None:
    assert title_bucket(title) == bucket


@pytest.mark.parametrize(
    ("title", "soc", "bucket"),
    [
        # Microsoft files job families, not titles.
        ("Software Engineering", "15-1252.00", "software engineer"),
        ("SOFTWARE ENGINEERING", None, "software engineer"),
        ("Data Science", "15-2051.00", "data"),
        # Generic titles fall back to the occupation code.
        ("Developer", "15-1252.00", "software engineer"),
        ("Senior Engineer", "15-1252.00", "senior software engineer"),
        ("Technical Lead", "15-1252.00", "senior software engineer"),
        ("Systems Engineer", "15-1244.00", "devops/sre"),
        ("Designer", "15-1255.00", "frontend"),
        ("Analyst", "15-1253.00", "qa"),
        # The title wins over the code when it is specific.
        ("Frontend Engineer", "15-1299.08", "frontend"),
        # Non-software jobs stay out.
        ("Assistant Professor", "25-1021.00", "other"),
        ("Manager", "11-3021.00", "other"),
        ("Medical Technologist", "29-2011.00", "other"),
    ],
)
def test_title_bucket_soc_fallback(title: str, soc: str | None, bucket: str) -> None:
    assert title_bucket(title, soc) == bucket


def test_title_bucket_empty() -> None:
    assert title_bucket(None) == "other"
    assert title_bucket("") == "other"
