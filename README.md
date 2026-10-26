# JobFit

A visa-aware job copilot. Paste a job description and JobFit tells you whether the job can work with your visa (sponsorship, ITAR, clearance, contract terms), shows the employer's real H-1B and green-card history from public DOL and USCIS data, and drafts a tailored resume where every claim is backed by your own verified experience.

**Not legal advice.** Confirm sponsorship with the employer.

Status: milestone M0 (scaffold). See [docs/SPEC.md](docs/SPEC.md) for the full plan and milestones.

## Layout

| Path | What |
|---|---|
| `apps/web` | React Router app (UI + API routes) on Cloudflare Workers |
| `packages/shared` | Zod schemas and shared logic, mirrored from the agent's Pydantic models |
| `services/agent` | Python FastAPI + LangGraph agent |

## Develop

Requires Node 22 (pnpm via `corepack enable`), Python 3.12 and [uv](https://docs.astral.sh/uv/).

```
pnpm install
pnpm dev                                   # web app
pnpm turbo run lint typecheck test         # TypeScript checks
cd services/agent && uv sync && uv run pytest
```

## Data sources

US Department of Labor (OFLC LCA and PERM disclosure data) and USCIS H-1B Employer Data Hub. Both are public US government data.
