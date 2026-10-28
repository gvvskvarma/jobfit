import base64
import binascii
import hashlib
import hmac
import os
import time
from collections.abc import Callable
from typing import Annotated

import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError
from starlette.concurrency import run_in_threadpool

from app import evidence
from app.llm import LLMError
from app.schemas import EvidenceDraft, EvidenceHit, ScreeningReport, UserContext
from app.screen import screen_job

app = FastAPI(title="JobFit agent")

MAX_CLOCK_SKEW_SECONDS = 300


class ScreenRequest(BaseModel):
    job_text: str
    user: UserContext = UserContext()


class ImportRequest(BaseModel):
    filename: str
    data: str  # base64, so the file is part of the signed JSON body


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    top_k: int = Field(default=8, ge=1, le=50)


def signature(secret: str, timestamp: str, user_id: str, body: bytes) -> str:
    """The web app signs `{timestamp}.{user_id}.{body}` with AGENT_HMAC_SECRET (SPEC 10, 12)."""
    message = f"{timestamp}.{user_id}.".encode() + body
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify(timestamp: str, user_id: str, sig: str, body: bytes) -> None:
    secret = os.environ.get("AGENT_HMAC_SECRET")
    if not secret:
        raise HTTPException(503, "The agent isn't configured to accept requests.")
    if not timestamp.isdigit() or abs(time.time() - int(timestamp)) > MAX_CLOCK_SKEW_SECONDS:
        raise HTTPException(401, "Request timestamp is missing or too old.")
    if not hmac.compare_digest(signature(secret, timestamp, user_id, body), sig):
        raise HTTPException(401, "Bad request signature.")


async def signed(
    request: Request,
    x_jobfit_timestamp: str = Header(),
    x_jobfit_user: str = Header(),
    x_jobfit_signature: str = Header(),
) -> tuple[str, bytes]:
    body = await request.body()
    verify(x_jobfit_timestamp, x_jobfit_user, x_jobfit_signature, body)
    return x_jobfit_user, body


Signed = Annotated[tuple[str, bytes], Depends(signed)]


def parse[T: BaseModel](schema: type[T], body: bytes) -> T:
    try:
        return schema.model_validate_json(body)
    except ValidationError as e:
        raise HTTPException(422, "The request body doesn't match the expected shape.") from e


async def with_db[T](fn: Callable[[psycopg.Connection], T]) -> T:
    def run() -> T:
        with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
            return fn(conn)

    return await run_in_threadpool(run)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/screen")
async def screen(req: Signed) -> ScreeningReport:
    _, body = req
    payload = parse(ScreenRequest, body)
    try:
        return await with_db(lambda conn: screen_job(conn, payload.job_text, payload.user))
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    except LLMError as e:
        raise HTTPException(502, "The job posting couldn't be analyzed. Try again.") from e


@app.post("/evidence/import")
async def import_resume(req: Signed) -> list[EvidenceDraft]:
    """Splits a resume into items for the user to review; nothing is saved here."""
    _, body = req
    payload = parse(ImportRequest, body)
    try:
        data = base64.b64decode(payload.data, validate=True)
        text = evidence.extract_text(payload.filename, data)
        return await run_in_threadpool(evidence.split_resume, text)
    except binascii.Error as e:
        raise HTTPException(422, "The file data isn't valid base64.") from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    except LLMError as e:
        raise HTTPException(502, "The resume couldn't be split into items. Try again.") from e


@app.post("/evidence/embed")
async def embed(req: Signed) -> dict[str, int]:
    user_id, _ = req
    return {"embedded": await with_db(lambda conn: evidence.embed_pending(conn, user_id))}


@app.post("/evidence/search")
async def search(req: Signed) -> list[EvidenceHit]:
    user_id, body = req
    p = parse(SearchRequest, body)

    def run(conn: psycopg.Connection) -> list[EvidenceHit]:
        # Rows saved while the agent was unreachable get their vectors now.
        evidence.embed_pending(conn, user_id)
        return evidence.search_evidence(conn, user_id, p.query, p.top_k)

    return await with_db(run)
