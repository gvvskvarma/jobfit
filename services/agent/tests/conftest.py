import os
from collections.abc import Iterator

import psycopg
import pytest

from etl.publish import load_env


@pytest.fixture
def db() -> Iterator[psycopg.Connection]:
    """A connection to the migrated test database; skipped when none is configured."""
    load_env()
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL not set")
    try:
        conn = psycopg.connect(url, connect_timeout=3)
    except psycopg.OperationalError as e:
        pytest.skip(f"database unreachable: {e}")
    with conn:
        yield conn
