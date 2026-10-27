# JobFit

A visa-aware job copilot. Paste a job description and JobFit tells you whether the job can work with your visa (sponsorship, ITAR, clearance, contract terms), shows the employer's real H-1B and green-card history from public DOL and USCIS data, and drafts a tailored resume where every claim is backed by your own verified experience.

**Not legal advice.** Confirm sponsorship with the employer.

Status: milestone M2 (screening) in progress. See [docs/SPEC.md](docs/SPEC.md) for the full plan and milestones.

## Layout

| Path | What |
|---|---|
| `apps/web` | React Router app (UI + API routes) on Cloudflare Workers |
| `packages/shared` | Zod schemas and shared logic, mirrored from the agent's Pydantic models |
| `services/agent` | Python FastAPI + LangGraph agent |

## Develop

Requires Node 22 (pnpm via `corepack enable`), Python 3.12 and [uv](https://docs.astral.sh/uv/).

```
cp .env.example .env.local                 # fill in the keys (gitignored)
grep -v ANTHROPIC .env.local > apps/web/.dev.vars   # the web app's copy, without the Claude key
docker compose up -d                       # Postgres + pgvector
pnpm install
pnpm --filter @jobfit/db migrate:deploy    # create tables and row-level security
pnpm dev                                   # web app on http://localhost:5173
(cd services/agent && uv run --env-file ../../.env.local uvicorn app.main:app --port 8000)  # screening service
pnpm turbo run lint typecheck test         # TypeScript checks
cd services/agent && uv sync && uv run pytest
```

### Load the public H-1B data

DOL blocks automated downloads, so download the LCA and PERM disclosure `.xlsx` files from the [OFLC performance data page](https://www.dol.gov/agencies/eta/foreign-labor/performance) into `data/raw/`, keeping their names. Then:

```
cd services/agent
uv run python -m etl.download --fy 2024 2025 2026   # fetches USCIS files, checks what's missing
for fy in 2024 2025 2026; do uv run python -m etl.publish --fy $fy; done   # one year at a time keeps memory near 3.5 GB
```

## API

| Endpoint | Returns |
|---|---|
| `GET /api/employers?q=` | Employers matching a name, busiest first |
| `GET /api/employers/:id` | H-1B, PERM and USCIS history by year, wage bands, data sources |
| `GET /api/discover?bucket=&state=&fy=` | Employers ranked by certified H-1B filings for a role and state |
| `POST /api/jobs` `{jobText}` | Saves a posting for the signed-in user and returns its `id` (30 a day) |
| `POST /api/jobs/:id/screen` | Screens a saved posting once and returns the report; later calls return the stored report |
| `POST /api/posting` `url=` | Pulls a posting's text from a company careers, Greenhouse, Lever or Ashby link (job boards are refused) |

## Data sources

US Department of Labor (OFLC LCA and PERM disclosure data) and USCIS H-1B Employer Data Hub. Both are public US government data.
