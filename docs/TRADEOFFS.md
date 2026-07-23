# HCAF Product-Surface Platform — Trade-Off Records

This document records architecture decisions for the HCAF Full-Stack / Product Engineer exercise. Each entry follows an ADR (Architecture Decision Record) format.

**Important:** These are not claims that one approach is universally correct. HCAF operates in a domain where constraints conflict — live-call latency, evolving ontology, multiple product surfaces, and limited frontend release cadence. Reasonable teams choose differently depending on which constraint dominates. The recommendations below reflect what we chose for the PoC and why, with explicit conditions under which we would reverse that choice.

For platform context, see [HCAF.md](./HCAF.md). For how ontology fits the four-layer model, see [ONTOLOGY.md](./ONTOLOGY.md).

---

## ADR-000: Ontology Modeling

**Status:** Accepted for PoC  
**Date:** 2026-07-23

### Context

HCAF's domain model evolves frequently. New payers, workflows, and entity types appear mid-week. The Operator Console and other product surfaces must render new fields with correct labels and types without waiting for a frontend release. The ontology is the shared vocabulary between agents, EHR integrations, UI schema bind paths, and analytics.

The exercise asks us to compare how that vocabulary is stored, versioned, and consumed.

### Options considered

| Criterion | JSON Schema registry | Graph database (Neo4j, etc.) | Protobuf / Avro | Hardcoded TypeScript types |
|-----------|---------------------|-------------------------------|-----------------|---------------------------|
| **Human readability** | High — JSON documents, reviewable in PRs | Low for non-graph engineers | Low — binary or generated stubs | High for TS developers only |
| **Versioning & evolution** | Good — semver + additive fields | Good — nodes/edges are flexible | Strict — requires schema registry discipline | Poor — every change is a code change |
| **Relationship modeling** | Adequate for flat entity/field models | Excellent — traversals, inference | None — flat messages | Manual — interfaces and unions |
| **Frontend consumption** | Native — `fetch` + validate | Requires API translation layer | Needs code generation | Direct import, tight coupling |
| **Validation at runtime** | Built-in (JSON Schema validators) | Custom or Cypher constraints | Generated validators | Compile-time only |
| **Operational cost** | Low — file or document store | High — cluster, backups, query tuning | Medium — schema registry service | None beyond the repo |
| **Alignment with FHIR / clinical models** | Mappable — JSON-LD bridge possible | Strong for linked clinical data | Common in service meshes | Ad hoc |
| **Time to first value** | Fast | Slow | Medium | Fastest for tiny domains |

### Recommendation

Use a **versioned JSON Schema registry** as the primary ontology store, served via `GET /v1/ontology` and shared as the `@hcaf/ontology` package.

The PoC models entities (`patient`, `provider`, `eligibility`, `priorAuth`) with typed fields, labels, and enum values. UI schema bind paths (`eligibility.rows`, `priorAuth.status`) resolve against this registry. Extensions bump the version (e.g. `1.0.0` → `1.1.0`) and propagate to surfaces over WebSocket.

This trades rich relationship traversal for speed of iteration and direct consumption by SDUI renderers — which matches the exercise's emphasis on weekly workflow changes rather than deep graph analytics.

### When we'd choose differently

- **Graph database** if HCAF's primary need shifts to multi-hop reasoning across clinical entities (e.g. "find all providers in network X who can perform procedure Y for payer Z with active prior auth") and agents query relationships at runtime, not just display flat fields.
- **Protobuf / Avro** if ontology changes are rare but inter-service throughput is extreme (millions of agent events per hour) and the UI contract is a derived, denormalized view — not the source of truth.
- **Hardcoded TypeScript** if the domain stabilizes for 12+ months, the team is small, and release cadence is not a bottleneck — or for a single surface with no cross-product vocabulary requirement.

There is no single correct answer. A mature HCAF would likely maintain a canonical clinical model (FHIR-aligned) internally while exposing a simplified, versioned JSON registry as the product-surface contract.

---

## ADR-001: Dynamic UI Rendering

**Status:** Accepted for PoC  
**Date:** 2026-07-23

### Context

Operators see dense, workflow-specific layouts during live calls. Workflows change faster than frontend teams can ship. HCAF needs a strategy for rendering UI that separates **what to show** (server) from **how to draw it** (client registry + design system).

The exercise explicitly asks us to navigate SDUI, low-code, hardcoded React, and alternatives without claiming one winner.

### Options considered

| Criterion | SDUI + component registry | JSON Schema Forms | Low-code builder | Module Federation | Hardcoded React |
|-----------|--------------------------|-------------------|------------------|-------------------|-----------------|
| **Change without frontend deploy** | Yes — schema push | Partial — form layout only | Yes — config publish | Partial — remote entry deploy | No |
| **Layout expressiveness** | High — arbitrary trees | Low — forms and fields | Medium — builder limits | High — full React | Highest |
| **Operator-console density** | Good with custom primitives | Poor for tables/dashboards | Variable | Good | Best |
| **Novel visualizations** | Needs registry entry | Not supported | Custom widget plugins | Ship new remote | Ship new component |
| **Learning curve** | Medium | Low | High (platform team) | High (webpack/Rspack) | Lowest |
| **Cross-surface consistency** | Strong — shared registry + DS | Weak — form-centric | Depends on export format | Fragmented remotes | Per-app drift |
| **Runtime safety** | Unknown types → fallback UI | Schema validation only | Builder validation | Remote code risk | Compile-time |
| **Stakeholder demo clarity** | High — "push schema, UI updates" | Medium | High for PMs, low for engineers | Low | Low |

### Recommendation

Use **server-driven UI with a typed component registry** (`@hcaf/surface-sdk`).

The backend publishes a UI schema tree (`Stack`, `Panel`, `Field`, domain composites like `EligibilityTable`). The client registry maps `type` strings to React components from `@hcaf/ui`. Generic primitives (`Field`, `Panel`, `DataTable`) handle ontology-driven fields; domain composites handle dense, call-critical layouts.

The PoC demonstrates schema push via `workflow.schema` WebSocket events and ontology extension that adds a `PriorAuth` panel without redeploying the Operator Console.

### When we'd choose differently

- **JSON Schema Forms** for internal configuration tooling or simple data-entry surfaces where layouts are form-shaped and density is not critical.
- **Low-code builder** if non-engineers (clinical ops, product) must own layout changes daily and the organization invests in a dedicated platform team to maintain the builder.
- **Module Federation** if different hospital systems or business units ship entirely custom visualizations that cannot be expressed in the schema vocabulary, and independent deploy cadence outweighs consistency.
- **Hardcoded React** for stable, high-stakes screens (e.g. emergency code-call UI) where every pixel is regulated, tested, and rarely changes.

There is no single correct answer. Most HCAF surfaces would use a hybrid: SDUI for evolving workflow panels, hardcoded React for shell chrome and safety-critical controls, and optional federation for customer-specific extensions.

---

## ADR-002: Real-Time Transport

**Status:** Accepted for PoC  
**Date:** 2026-07-23

### Context

During a live call, agent recommendations, eligibility updates, and operator actions must propagate in seconds. The Operator Console is bidirectional: operators approve or override agent suggestions while new data arrives from the backend. Latency and connection reliability directly affect operator trust.

### Options considered

| Criterion | WebSockets | Server-Sent Events (SSE) | gRPC (incl. streaming) | HTTP polling |
|-----------|-----------|--------------------------|--------------------------|--------------|
| **Bidirectional** | Yes | No (client → server needs separate channel) | Yes | Yes (inefficient) |
| **Browser support** | Universal | Universal | Requires grpc-web proxy | Universal |
| **Firewall / proxy traversal** | Sometimes blocked | Better (HTTP) | Often blocked | Best |
| **Message framing** | Custom (JSON envelopes) | Event stream | Protobuf | Request/response |
| **Reconnection** | Manual or library (Socket.IO) | Built-in `EventSource` | Client library | Trivial |
| **Backpressure & ordering** | Application-level | Application-level | Built-in streams | N/A |
| **Operational complexity** | Medium — sticky sessions, scaling | Low — stateless HTTP | High — proxies, codegen | Lowest |
| **Fit for operator actions** | Natural — same channel | Awkward — needs POST side channel | Good in service mesh | Poor at low latency |

### Recommendation

Use **WebSockets** with a thin JSON message envelope for the product-surface channel.

Event types in the PoC: `workflow.schema`, `data.patch`, `agent.recommendation`, `ontology.updated`, `workflow.progress`, `call.queue`, `platform.notice`, and client → server `operator.action` (with optional `feedback` for override) and `call.switch`.

This gives bidirectional operator interaction on the same connection that streams agent output — a requirement SSE cannot satisfy without a parallel HTTP channel.

### When we'd choose differently

- **SSE** for read-only surfaces (analytics dashboards, audit feeds) where the client never sends actions on the same channel and simpler infrastructure is preferred.
- **gRPC streaming** for service-to-service agent orchestration behind the API gateway, especially if the agent runtime is already gRPC-native and the browser connects only to a BFF that translates to WebSocket/SSE.
- **Polling** for fallback when WebSocket connections fail in restrictive hospital networks, or for low-frequency status checks — not as the primary live-call transport.

There is no single correct answer. Production HCAF would likely use WebSockets for operator surfaces, gRPC internally between agents and workflow services, and SSE for read-only subscribers — with polling as a degraded-mode fallback.

---

## ADR-003: Design System

**Status:** Accepted for PoC  
**Date:** 2026-07-23

### Context

HCAF has multiple product surfaces (Operator Console, config tooling, analytics) with no established visual consistency. Operators need information-dense layouts; accessibility and brand alignment matter for hospital procurement. The design system must work across SDUI-rendered and hardcoded components.

### Options considered

| Criterion | shadcn-style monorepo (`@hcaf/ui`) | Material UI (MUI) | Web Components (Lit, Stencil) |
|-----------|-----------------------------------|-------------------|--------------------------------|
| **Visual ownership** | Full — copy-paste, customize tokens | Themed but recognizably Material | Full — framework-agnostic |
| **Density for operator UIs** | Excellent — tailor tokens (`compact`) | Poor default — overrides needed | Depends on implementation |
| **React integration** | Native | Native | Wrapper or `@lit/react` |
| **Cross-framework surfaces** | React only without extra work | React only | Any framework |
| **Bundle size** | Tree-shaken per primitive | Larger unless careful | Per-component load |
| **Accessibility** | Radix primitives (if using shadcn) | Mature, tested | Varies by library |
| **SDUI registry fit** | Direct — components are imports | Direct | Indirect — custom elements in registry |
| **Time to first value** | Fast for React teams | Fastest out of box | Slower initial setup |
| **Vendor lock-in** | Low — you own the code | Medium | Low |

### Recommendation

Use an **in-repo design system** (`@hcaf/ui`) with HCAF-specific tokens, compact density defaults, and semantic status variants (`success`, `warning`, `danger`).

**PoC:** primitives are owned in-repo and styled via CSS custom properties (`--hcaf-primary`, `--hcaf-text-muted`, etc.). `DataTable` is built on TanStack Table. No Tailwind or shadcn dependency in this repository.

**Production path:** migrate primitives to shadcn/ui + Tailwind while keeping the same token names and SDUI registry contracts.

### When we'd choose differently

- **MUI** if time-to-market dominates and the team accepts Material styling with heavy theme overrides, or if the organization already standardizes on MUI across products.
- **Web Components** if HCAF must embed UI into non-React hosts (legacy Angular config tools, native desktop shells, third-party EHR iframes) from a single component source.
- **No shared system** (intentionally) only during early exploration — not a viable long-term choice given the exercise's multi-surface requirement.

There is no single correct answer. The shadcn monorepo pattern fits a React-first platform with a dedicated design owner; Web Components become compelling when the surface roadmap includes non-React embeds.

---

## ADR-004: State Sync

**Status:** Accepted for PoC  
**Date:** 2026-07-23

### Context

Call state is large and updates frequently during a live interaction: eligibility rows change, agent recommendations arrive, operator actions mutate nested objects. The transport must minimize payload size and re-render scope while remaining correct when updates are concurrent or out of order.

### Options considered

| Criterion | JSON Patch (RFC 6902) | Full state replace |
|-----------|----------------------|-------------------|
| **Payload size** | Small — only deltas | Large — entire call state |
| **Client complexity** | Medium — apply patch, handle conflicts | Low — assign new object |
| **Server complexity** | Medium — compute diffs | Low — serialize full state |
| **Debugging** | Harder — trace operations | Easy — snapshot diff |
| **Conflict handling** | Requires merge strategy or versioning | Last-write-wins is implicit |
| **Re-render optimization** | Fine-grained if keyed by path | Coarse — often full tree |
| **Schema push interaction** | Orthogonal — schema and data separate | Same |
| **Library support** | `fast-json-patch`, mature | Native JSON |

### Recommendation

Use **JSON Patch** for incremental data updates (`data.patch` events) and **full replace** for UI schema changes (`workflow.schema` events) and **operator action results** (full state replace via `data.patch` with `path: ""`).

The PoC applies patches client-side via `fast-json-patch` after cloning state. Schema pushes replace the entire UI tree because layout changes are infrequent relative to data ticks. Operator approve/override uses full state replace for reliability — partial patches proved unreliable when nested entity objects changed.

### When we'd choose differently

- **Full replace** if call state stays small (< 5 KB), update frequency is low (< 1 Hz), or the team prioritizes debuggability over bandwidth — a valid choice for early PoCs.
- **JSON Patch** exclusively (including schema) if UI trees grow large and partial layout updates become frequent — e.g. toggling panel visibility without resending the full tree.
- **CRDTs or operational transforms** if multiple operators edit the same call state concurrently with merge semantics — beyond the single-operator PoC scope.
- **Field-level subscriptions** (GraphQL-style) if the client only cares about a subset of paths and the server can push targeted updates without the client applying patches.

There is no single correct answer. JSON Patch earns its complexity when state is large and updates are frequent; full replace is simpler and often sufficient until profiling proves otherwise.

---

## ADR-005: API / SDK Shape

**Status:** Accepted for PoC  
**Date:** 2026-07-23

### Context

Multiple product surfaces need a consistent way to authenticate, fetch ontology and schema, subscribe to live updates, and send operator actions. The API boundary is a long-lived contract between HCAF platform teams and surface teams.

### Options considered

| Criterion | Thin SDK + REST / WebSocket | GraphQL + subscriptions | tRPC |
|-----------|----------------------------|--------------------------|------|
| **Type safety end-to-end** | Manual — OpenAPI + SDK types | Codegen from schema | Native in TS monorepo |
| **Non-TypeScript consumers** | Excellent | Good | Poor — TS-only |
| **Real-time subscriptions** | Custom WS protocol | Built-in | Possible via WS adapter |
| **Caching & CDN** | REST caches naturally | Harder | N/A for mutations |
| **Versioning discipline** | Explicit URL versions (`/v1/`) | Schema evolution rules | Breaking changes ripple |
| **Learning curve for new surfaces** | Low — HTTP + events | Medium — GraphQL literacy | Low inside monorepo |
| **BFF flexibility** | High — surfaces fetch what they need | High — query shaping | Tied to server implementation |
| **External partner integration** | Standard REST/OpenAPI | GraphQL public API | Unusual externally |

### Recommendation

Use a **thin SDK** (`@hcaf/surface-sdk`) over **versioned REST** for hydration and **WebSocket** for live events.

The SDK exposes `createSurfaceSession`, `fetchSchema`, `fetchState`, `connect`, `on(event)`, `sendOperatorAction`, and `applyDataPatch`. Surfaces remain thin: they import `@hcaf/ui` for chrome and `@hcaf/surface-sdk` for platform wiring.

REST endpoints are resource-oriented (`/v1/ontology`, `/v1/calls/:id/schema`, `/v1/calls/:id/state`). WebSocket messages use a `{ type, payload }` envelope — simple to document, debug in browser DevTools, and implement in non-React clients.

### When we'd choose differently

- **GraphQL + subscriptions** if surfaces have highly variable data needs (analytics dashboards querying disparate entities) and a single gateway should serve web, mobile, and partner integrations with query flexibility.
- **tRPC** if all surfaces live in one TypeScript monorepo, API and UI ship together, and external REST exposure is handled by a separate gateway layer.
- **gRPC** for internal agent-to-platform communication, with the thin SDK talking to a REST/WS BFF — not directly to gRPC from the browser.

There is no single correct answer. A thin SDK over REST/WS balances openness (future mobile, embedded, partner surfaces) with the type safety a shared monorepo provides through `@hcaf/ontology` and SDK TypeScript interfaces.

---

## ADR-006: Deployment Without Frontend Redeploy

**Status:** Accepted for PoC  
**Date:** 2026-07-23

### Context

A core HCAF constraint: workflows and ontology change weekly, but frontend releases are slow and risky during live hospital operations. The platform must support pushing new fields, entities, and layouts to operators without redeploying the Operator Console bundle.

Not every change can avoid a deploy. The decision is which classes of change are schema-driven and which still require shipping code.

### Options considered

| Criterion | Schema-only push | Lazy component registry | Module Federation remotes |
|-----------|-----------------|------------------------|--------------------------|
| **What changes without deploy** | Layout, bind paths, generic fields | Above + new component types (lazy chunk) | Above + full custom React modules |
| **Frontend release needed for** | New component types in registry | New registry loader logic | Remote bundle publish (not host redeploy) |
| **Risk of runtime errors** | Low — generic fallbacks | Medium — chunk load failures | Medium — version skew between host and remote |
| **Operational model** | Backend publishes schema | Backend triggers lazy import map | Separate remote deployment pipeline |
| **Customer-specific UI** | Limited to schema vocabulary | Per-tenant registry entries | Per-tenant remote bundles |
| **Complexity** | Lowest | Medium | Highest |
| **Demonstrability in PoC** | High — auto-composed workflow modules | Medium | Low for exercise timeline |

### Recommendation

Use a **schema-only push** as the default path, with a **static component registry** that includes generic primitives and a small set of domain composites.

The PoC flow (runtime composition — no hand-authored templates per module):

1. Workflow engine surfaces entity data for a module (e.g. `priorAuth`, `cob`, `claims`).
2. `adviseLayout()` picks a layout strategy from data shape; `composeEntityPanel()` builds the UI tree.
3. `OntologyService.extendWithStep()` bumps ontology version as entities appear.
4. Connected clients receive `ontology.updated`, `workflow.schema`, `data.patch`, and `platform.notice` — no Operator Console redeploy.

Admin `POST /v1/admin/push-schema` and `POST /v1/admin/extend-ontology` remain as manual testing aliases; the primary demo path is **server-driven auto-advance**.

Unknown `type` values in schema render a fallback (`Unknown` component) rather than crashing. Truly novel visualizations (e.g. a custom prior-auth timeline) would require a registry addition — acceptable as an occasional frontend release, not a weekly one.

### When we'd choose differently

- **Lazy component registry** if new domain composites are added monthly and the team wants to ship them as lazy-loaded chunks without redeploying the host shell — import maps or dynamic `import()` keyed by schema `type`.
- **Module Federation** if hospital customers or business units need fully custom UI modules on independent release trains, and HCAF provides only the shell, auth, and data channel.
- **Full redeploy** if schema-driven UI proves too limiting for operator UX and workflow changes slow down — a valid retreat if the schema vocabulary cannot express required layouts.

There is no single correct answer. Schema-only push covers the majority of HCAF's weekly ontology and layout changes; registry and federation extensions are escalation paths for visual complexity, not day-one requirements.

---

## How to use these records in stakeholder conversations

| Stakeholder | Lead with | Avoid |
|-------------|-----------|-------|
| **Commercial** | Schema push = faster time-to-value for new payer workflows | Implementation jargon (RFC 6902, Module Federation) |
| **Product** | SDUI lets product iterate layouts without eng queue | Claiming zero frontend work ever |
| **AI / Agents** | Ontology version is the contract agents write into | Overpromising graph DB capabilities |
| **Engineering** | Thin SDK, JSON Patch, registry fallbacks | Pretending WebSockets never fail in hospital networks |

When asked "why not X?", point to the **When we'd choose differently** section of the relevant ADR. The exercise rewards demonstrating that trade-offs depend on constraints, not personal preference.

---

## Related documents

- [HCAF.md](./HCAF.md) — platform and exercise context
- [ONTOLOGY.md](./ONTOLOGY.md) — four-layer model and bind paths
- [ARCHITECTURE_PROPOSAL.md](./ARCHITECTURE_PROPOSAL.md) — full platform architecture
- [SCHEMA_COMPOSITION.md](./SCHEMA_COMPOSITION.md) — runtime schema composition pipeline
