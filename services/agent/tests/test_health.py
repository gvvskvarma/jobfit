import json
import time

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.llm import LLMError
from app.schemas import EmployerSignal, ScreeningReport

SECRET = "test-secret"
client = TestClient(main.app)


def test_health() -> None:
    assert client.get("/health").json() == {"status": "ok"}


def signed(body: dict, *, user: str = "user_1", ts: int | None = None, secret: str = SECRET):
    raw = json.dumps(body).encode()
    stamp = str(ts if ts is not None else int(time.time()))
    return raw, {
        "x-jobfit-timestamp": stamp,
        "x-jobfit-user": user,
        "x-jobfit-signature": main.signature(secret, stamp, user, raw),
        "content-type": "application/json",
    }


@pytest.fixture
def agent(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AGENT_HMAC_SECRET", SECRET)
    monkeypatch.setenv("DATABASE_URL", "postgresql://unused")
    seen = {}

    def screen_job(conn, text, user):  # noqa: ANN001, ANN202
        seen["text"], seen["user"] = text, user
        if text == "boom":
            raise LLMError("x")
        if text == "too long":
            raise ValueError("The job posting is longer than 30,000 characters.")
        return ScreeningReport(
            verdict="skip",
            flags=[],
            employer=EmployerSignal(employer=None, matched=False),
            summary="Skip.",
        )

    class FakeConn:
        def __enter__(self):  # noqa: ANN204
            return self

        def __exit__(self, *_: object) -> None:
            pass

    monkeypatch.setattr(main, "screen_job", screen_job)
    monkeypatch.setattr(main.psycopg, "connect", lambda _url: FakeConn())
    return seen


def test_screen_accepts_a_signed_request(agent) -> None:
    raw, headers = signed({"job_text": "ITAR role", "user": {"visa_status": "H1B"}})
    res = client.post("/screen", content=raw, headers=headers)
    assert res.status_code == 200
    assert res.json()["verdict"] == "skip"
    assert agent["user"].visa_status == "H1B"


def test_screen_rejects_bad_signature_tampering_and_staleness(agent) -> None:
    raw, headers = signed({"job_text": "x"}, secret="wrong")
    assert client.post("/screen", content=raw, headers=headers).status_code == 401
    raw, headers = signed({"job_text": "x"})
    tampered = raw.replace(b'"x"', b'"y"')
    assert client.post("/screen", content=tampered, headers=headers).status_code == 401
    raw, headers = signed({"job_text": "x"})
    headers["x-jobfit-user"] = "someone_else"
    assert client.post("/screen", content=raw, headers=headers).status_code == 401
    raw, headers = signed({"job_text": "x"}, ts=int(time.time()) - 600)
    assert client.post("/screen", content=raw, headers=headers).status_code == 401
    assert client.post("/screen", content=raw).status_code == 422  # headers missing


def test_screen_maps_errors(agent) -> None:
    raw, headers = signed({"job_text": "boom"})
    assert client.post("/screen", content=raw, headers=headers).status_code == 502
    raw, headers = signed({"job_text": "too long"})
    assert client.post("/screen", content=raw, headers=headers).status_code == 422
    raw, headers = signed({"wrong": 1})
    assert client.post("/screen", content=raw, headers=headers).status_code == 422


def test_screen_refuses_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AGENT_HMAC_SECRET", raising=False)
    raw, headers = signed({"job_text": "x"})
    assert client.post("/screen", content=raw, headers=headers).status_code == 503
