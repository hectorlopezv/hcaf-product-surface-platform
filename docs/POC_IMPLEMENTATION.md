# PoC Implementation Status

This document records **what is actually implemented in this repository** versus what the architecture proposal recommends for production. Read this before reviewing `ARCHITECTURE_PROPOSAL.md`, which mixes target-state recommendations with PoC scope.

## Implemented stack (this repo)

| Layer | Implementation |
|-------|----------------|
| **Monorepo** | pnpm workspaces + Turborepo |
| **API** | NestJS 11, `@nestjs/config`, Socket.io, `SocketIoService` (DI) |
| **Frontends** | React 19 + Vite 6 |
| **Server state** | TanStack Query (`@tanstack/react-query`) via `@hcaf/api-client` |
| **Tables** | TanStack Table (`@tanstack/react-table`) in `@hcaf/ui` `DataTable` |
| **SDUI** | `@hcaf/surface-sdk` renderer + JSON Patch session |
| **Design system** | `@hcaf/ui` — **custom CSS variables** (`--hcaf-*`), inline-styled primitives |
| **Config** | Root `.env.example`; API reads `PORT`, URLs, tick intervals; Vite apps use `VITE_*` |
| **CI** | GitHub Actions — `pnpm build` on push/PR |
| **Deploy** | GitHub Actions deploy workflow (Railway API + Vercel frontends when secrets are set) |

## Not implemented in PoC (recommended for production)

| Item | Notes |
|------|-------|
| **shadcn/ui + Tailwind** | Proposed in architecture docs as the production design-system path. PoC uses owned primitives in `@hcaf/ui` instead. |
| **Full FHIR / clinical graph** | Ontology is a versioned JSON registry in `@hcaf/ontology`. |
| **LLM layout advisor** | Rule-based `adviseLayout` in `schema-composer.ts`. |
| **Auth / RBAC** | Open CORS for local demo. |
| **Persistent storage** | In-memory call state per process. |

## Package map

```
packages/api-client   REST helpers + TanStack Query keys
packages/ontology     Entity/field definitions
packages/ui           Badge, Card, DataTable (TanStack Table), SurfaceNav, tokens
packages/surface-sdk  SDUI renderer, session, shared DTO types

apps/api              NestJS modules: calls, ontology, schema, config, admin
apps/operator-console WebSocket + TanStack Query bootstrap
apps/config-tool      TanStack Query workspace + mutations
apps/analytics        TanStack Query polling summary
```

## Review talking points

See [TALKING_POINTS.md](./TALKING_POINTS.md) for how to explain SDUI, WebSocket vs polling, schema composition, and agent governance in a technical interview.

## Local run

```bash
cp .env.example .env
pnpm install
pnpm dev
```
