# Talking Points — Technical Decisions

Use this guide to explain the PoC in a technical review.

## 1. Why server-driven UI (SDUI)?

**Decision:** The operator console renders panels from a `UISchema` JSON document fetched from the API, not from hard-coded React screens per workflow.

**Reasoning:**
- Healthcare workflows change frequently (new payers, new prior-auth rules). Shipping a frontend deploy for each module is slow.
- The API already owns workflow state, ontology, and agent recommendations — it is the natural place to describe what the operator should see.
- New entity types (e.g. transport benefit) can surface without a frontend code change when the schema composer picks a layout strategy from data shape.

**Trade-off:** More complexity in the schema composer and component registry; harder to debug than static JSX.

## 2. Why NestJS for the API?

**Decision:** NestJS modules with dependency injection, not a plain Express script.

**Reasoning:**
- Clear module boundaries: `CallsModule`, `OntologyModule`, `SchemaModule`, `ConfigModule`.
- `ConfigModule` loads environment variables; `SocketIoService` injects WebSocket access into controllers instead of `globalThis`.
- Scales to guards, interceptors, and DTO validation as the API grows.

## 3. Why WebSocket on operator console but TanStack Query on analytics?

**Decision:** Operator console uses Socket.io for live eligibility patches and workflow advances. Analytics uses TanStack Query with `refetchInterval` on `GET /v1/analytics/summary`.

**Reasoning:**
- Operators need sub-second updates during a live call (push model).
- Analytics is read-only aggregate data — TanStack Query handles polling, caching, loading/error states, and retries without manual `useEffect` + `setInterval`.
- Config tooling uses `useQuery` for workspace data and `useMutation` for surface/ontology changes with cache invalidation.

## 4. Runtime schema composition

**Decision:** A rule-based layout advisor (`adviseLayout`) picks among strategies (`field-grid`, `tabular-with-summary`, `timeline-schedule`, etc.) based on entity data shape.

**Reasoning:**
- Demonstrates how ontology + data can drive UI without hand-authored templates per module.
- The `/v1/schema/compose/:moduleId` endpoint lets config-tool preview composition before surfacing on a call.

**Extension path:** Swap the advisor for an HCAF agent that selects from a registered component catalog.

## 5. Agent approve / override governance

**Decision:** Operator actions (`approve`, `override`) are handled server-side in `CallsService.handleOperatorAction`, not as client-only state.

**Reasoning:**
- Audit trail: override reasons are stored in `feedbackLog` and exposed in analytics.
- Server is source of truth — UI patches follow server events.
- Prevents inconsistent state if the operator refreshes mid-call.

## 6. Configuration via environment variables

**Decision:** URLs, ports, and tick intervals live in `.env` (see `.env.example`), loaded by `@nestjs/config` on the API and `import.meta.env` on Vite apps.

**Reasoning:**
- No hardcoded `localhost` in production builds.
- Each deploy target (local, staging, prod) overrides the same keys.

## 7. Monorepo layout

**Decision:** `packages/ontology`, `packages/ui`, `packages/surface-sdk` shared across three React apps and the API.

**Reasoning:**
- Ontology types are single-sourced.
- `SurfaceNav` and design tokens live in `@hcaf/ui` once, not copied per app.
- `DataTable` uses TanStack Table for sortable columns in analytics, config-tool, and SDUI registry renders.
- API re-exports shared types from `@hcaf/surface-sdk` to avoid drift with the renderer.
