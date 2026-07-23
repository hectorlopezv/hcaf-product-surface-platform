# HCAF Product-Surface Platform (Exercise)

Architecture proposal and proof-of-concept for SpinSci's Healthcare AI Fabric product surfaces.

**Stack:** NestJS 11 (API) · React 19 + Vite 6 + TanStack Query & Table (frontends) · Socket.io · pnpm + Turbo monorepo

## Documentation

| Doc | Purpose |
|-----|---------|
| [docs/TALKING_POINTS.md](docs/TALKING_POINTS.md) | **Technical decisions to explain in review** |
| [docs/APP_FLOW_SLIDES.md](docs/APP_FLOW_SLIDES.md) | App flow slide deck (UI ↔ API) |
| [docs/ARCHITECTURE_PROPOSAL.md](docs/ARCHITECTURE_PROPOSAL.md) | Full architecture proposal |
| [docs/SCHEMA_COMPOSITION.md](docs/SCHEMA_COMPOSITION.md) | Runtime schema composition |
| [docs/SDUI_AND_AGENT_MODEL.md](docs/SDUI_AND_AGENT_MODEL.md) | SDUI + agent approve/override model |

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm dev
```

| Surface | URL |
|---------|-----|
| Operator Console | http://localhost:5173 |
| Config Tooling | http://localhost:5174 |
| Analytics | http://localhost:5175 |
| API | http://localhost:3001 |

Configuration is read from `.env` (see `.env.example`). Frontends use `VITE_*` variables; the API uses `PORT`, interval timings, and surface URLs.

## Monorepo structure

```
apps/
  api/                 NestJS REST + WebSocket (@nestjs/config)
  operator-console/    React + Vite + TanStack Query — live operator SDUI
  config-tool/         Ontology & workflow configuration (TanStack Query)
  analytics/           Read-only cross-call metrics (TanStack Query polling)
packages/
  api-client/          @hcaf/api-client — typed REST client + query keys
  ontology/            @hcaf/ontology — entity/field definitions
  ui/                  @hcaf/ui — shared components, SurfaceNav, TanStack Table DataTable
  surface-sdk/         @hcaf/surface-sdk — SDUI renderer + session
```

## PoC highlights

- 5 concurrent patient calls with independent workflow state
- Server-driven workflow modules surfaced automatically
- Runtime schema composition from entity data shape
- Agent approve/override with server-side state changes
- Override reasons logged and visible in Analytics
