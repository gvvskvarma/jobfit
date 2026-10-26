# JobFit

A visa-aware job copilot. Paste a job description and JobFit tells you whether the job can work with your visa (sponsorship, ITAR, clearance, contract terms), shows the employer's real H-1B and green-card history from public DOL and USCIS data, and drafts a tailored resume where every claim is backed by your own verified experience.

**Not legal advice.** Confirm sponsorship with the employer.

Status: milestone M1 (data foundation) in progress. See [docs/SPEC.md](docs/SPEC.md) for the full plan and milestones.

## Layout

| Path | What |
|---|---|
| `apps/web` | React Router app (UI + API routes) on Cloudflare Workers |
| `packages/shared` | Zod schemas and shared logic, mirrored from the agent's Pydantic models |
| `services/agent` | Python FastAPI + LangGraph agent |

## Develop

Requires Node 22 (pnpm via `corepack enable`), Python 3.12 and [uv](https://docs.astral.sh/uv/).

```
cp .env.example .env.local                 # local database URL (gitignored)
cp .env.local apps/web/.dev.vars           # the same, for the Workers dev server
docker compose up -d                       # Postgres + pgvector
pnpm install
pnpm --filter @jobfit/db migrate:deploy    # create tables and row-level security
pnpm dev                                   # web app on http://localhost:5173
pnpm turbo run lint typecheck test         # TypeScript checks
cd services/agent && uv sync && uv run pytest
```

### Load the public H-1B data

DOL blocks automated downloads, so download the LCA and PERM disclosure `.xlsx` files from the [OFLC performance data page](https://www.dol.gov/agencies/eta/foreign-labor/performance) into `data/raw/`, keeping their names. Then:

```
cd services/agent
uv run python -m etl.download --fy 2023 2024 2025   # fetches USCIS files, checks what's missing
uv run python -m etl.publish --fy 2023 2024 2025    # loads into DATABASE_URL
```

## API

| Endpoint | Returns |
|---|---|
| `GET /api/employers?q=` | Employers matching a name, busiest first |
| `GET /api/employers/:id` | H-1B, PERM and USCIS history by year, wage bands, data sources |
| `GET /api/discover?bucket=&state=&fy=` | Employers ranked by certified H-1B filings for a role and state |

## Data sources

US Department of Labor (OFLC LCA and PERM disclosure data) and USCIS H-1B Employer Data Hub. Both are public US government data.
