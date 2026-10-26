import hashlib
import hmac
import os
import time

import psycopg
from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ValidationError
from starlette.concurrency import run_in_threadpool

from app.llm import LLMError
from app.schemas import ScreeningReport, UserContext
from app.screen import screen_job

app = FastAPI(title="JobFit agent")

MAX_CLOCK_SKEW_SECONDS = 300


class ScreenRequest(BaseModel):
    job_text: str
    user: UserContext = UserContext()


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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/screen")
async def screen(
    request: Request,
    x_jobfit_timestamp: str = Header(),
    x_jobfit_user: str = Header(),
    x_jobfit_signature: str = Header(),
) -> ScreeningReport:
    body = await request.body()
    verify(x_jobfit_timestamp, x_jobfit_user, x_jobfit_signature, body)
    try:
        payload = ScreenRequest.model_validate_json(body)
    except ValidationError as e:
        raise HTTPException(422, "The request body isn't a valid screening request.") from e

    def run() -> ScreeningReport:
        with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
            return screen_job(conn, payload.job_text, payload.user)

    try:
        return await run_in_threadpool(run)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    except LLMError as e:
        raise HTTPException(502, "The job posting couldn't be analyzed. Try again.") from e
