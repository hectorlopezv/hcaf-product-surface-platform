# Runtime Schema Composition

When a **new entity** surfaces during a live call, HCAF does not require a hand-authored React screen or a pre-built UI template. The API composes a UI schema at runtime from **ontology + entity data shape**, pushes it over WebSocket, and the Operator Console renders it through the fixed `@hcaf/surface-sdk` registry.

**Read first:** [SDUI_AND_AGENT_MODEL.md](./SDUI_AND_AGENT_MODEL.md) — what SDUI avoids, registry mental model, when code changes are needed, agent approve/override governance.

This document describes that pipeline end-to-end, with concrete examples from the PoC.

---

## Pipeline overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. TRIGGER — New entity data arrives                                    │
│    Workflow engine / agent detects blocker (e.g. priorAuth required)    │
│    Entity instance written to call state                                │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. ONTOLOGY EXTENSION                                                   │
│    OntologyService.extendWithStep()                                     │
│    Merges entity fields from ontology definition + inferred data keys   │
│    Version bumps (e.g. 1.0.0 → 1.0.1)                                   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. LAYOUT ADVISOR (rule-based; LLM-ready slot)                          │
│    adviseLayout() reads entity data shape                               │
│    Picks one of 7 layout strategies                                     │
│    Returns strategy + human-readable reasoning                          │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. SCHEMA COMPOSER                                                      │
│    composeEntityPanel() builds UISchemaNode tree                        │
│    WorkflowCard + StatGrid / Timeline / DataTable / Alert / etc.        │
│    Appends panel to existing call schema (server-side merge)            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. WEBSOCKET PUSH                                                       │
│    workflow.schema  — full updated UI tree                              │
│    data.patch       — full call state (entity values included)          │
│    ontology.updated — new ontology version                              │
│    platform.notice  — layout strategy + composed flag                   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. SURFACE RENDERER (unchanged client)                                  │
│    SurfaceRenderer walks schema tree                                    │
│    Maps type → registered component (no redeploy)                       │
│    Binds data via dot-paths (e.g. priorAuth.status)                     │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key idea:** The frontend never decides *what* to show. It only knows how to render registered component `type`s. New entities are handled on the server.

---

## When does this run?

In the PoC, the workflow engine surfaces modules automatically:

| Trigger | Behavior |
|---------|----------|
| Boot stagger | Each of 5 calls gets a first module at offset timing (~1.5s + 900ms per patient) |
| Workflow timer | Every ~7s per call, next module from per-patient shuffled deck |
| Agent pause | **Workflow pauses** while `agent.latest.status === 'pending'` — operator must Approve/Override |
| After operator acts | Next module surfaces ~3s after successful approve/override |

Each call uses `personalizeModuleState()` and `personalizeAgent()` so modules and recommendations differ per patient — not identical canned data.

In production, the trigger would be:

- HCAF agent detects a blocker during the call
- Eligibility/claims integration returns new entity data
- Operator action causes workflow to branch

Regardless of trigger, the composition path is identical.

### Code path (PoC)

| Step | File |
|------|------|
| Trigger + broadcast | `apps/api/src/main.ts` → workflow timer + `broadcastWorkflowAdvance()` |
| Per-patient shuffle + personalize | `apps/api/src/workflows/workflow-random.ts` |
| Advance call + compose | `apps/api/src/calls/calls.service.ts` → `advanceScenario()` |
| Operator action + re-compose | `apps/api/src/calls/calls.service.ts` → `handleOperatorAction()` + `refreshModulePanel()` |
| Agent handlers | `apps/api/src/calls/agent-actions.ts` → `executeAgentAction()` |
| Layout advisor | `apps/api/src/schema/schema-composer.ts` → `adviseLayout()` |
| Schema composer | `apps/api/src/schema/schema-composer.ts` → `composeEntityPanel()` |
| Ontology merge | `apps/api/src/ontology/ontology.service.ts` → `extendWithStep()` |
| WebSocket emit | `apps/api/src/calls/call-broadcast.ts` → `broadcastScenarioUpdate()` |
| Client render | `packages/surface-sdk/src/renderer.tsx` → `SurfaceRenderer` |

---

## Inputs to the composer

Each new entity provides three inputs. **No `schemaNode` is stored in workflow definitions.**

```typescript
{
  entityKey: 'priorAuth',           // ontology entity name
  title: 'Prior Authorization',     // panel title
  panelId: 'priorAuth',             // dedupe key when merging schema
  fields: [                         // ontology field definitions (labels, types)
    { bind: 'priorAuth.required', label: 'Required', fieldType: 'boolean' },
    { bind: 'priorAuth.status', label: 'Status' },
  ],
  entityData: {                     // runtime instance — drives layout advisor
    required: true,
    status: 'not_started',
    reason: 'Specialist visit requires payer pre-authorization',
    procedure: 'CPT 93306 — Echocardiogram',
  }
}
```

The **layout advisor reads `entityData` shape**. The **composer uses `fields` + `entityData`** for labels, bind paths, and fallback grids.

---

## Layout strategies

The advisor evaluates rules in priority order. First match wins.

| Priority | Strategy | Data shape signal | Composed components |
|----------|----------|-------------------|---------------------|
| 1 | `cob-flow` | `primaryPayer` + `secondaryPayer` | `WorkflowCard` → `CobFlow` |
| 2 | `progress-dashboard` | `met`/`annual`, `oopMet`/`oopMax` pairs | `ProgressPanel` + `StatGrid` |
| 3 | `timeline-schedule` | `slots[]` array | `Timeline` + `Grid` of `Field`s |
| 4 | `escalation-split` | `history[]` array | `Alert` + `Split` → `StatGrid` + `Timeline` |
| 5 | `tabular-with-summary` | `rows[]` or `documents[]` | `StatGrid` + `DataTable` + `Alert` |
| 6 | `alert-split` | long string in `alert`, `reason`, `riskNote`, etc. | `Split` → stats + `Alert` |
| 7 | `field-grid` | **fallback** — any scalar entity | `StatGrid` + `Grid` of `Field`s |

### LLM-ready slot

`adviseLayout()` is intentionally isolated. In production, an HCAF agent LLM would receive:

- Registered component catalog (`WorkflowCard`, `StatGrid`, `Timeline`, …)
- Ontology entity definition
- Entity instance JSON

…and return a **strategy name** (or explicit component tree) from the same catalog. The composer would remain deterministic; only the advisor would change.

---

## Examples

### Example 1 — Coordination of Benefits (`cob-flow`)

**Entity data arrives:**

```json
{
  "cob": {
    "primaryPayer": "Aetna",
    "secondaryPayer": "Medicare Part B",
    "rule": "Medicare secondary when employer coverage < 20 employees",
    "order": "Aetna → Medicare"
  }
}
```

**Advisor reasoning:**

```
Detected primaryPayer + secondaryPayer → CobFlow visualization
Composed CobFlow — no hand-authored template
```

**Composed schema (excerpt):**

```json
{
  "type": "WorkflowCard",
  "props": {
    "title": "Coordination of Benefits",
    "panelId": "cob",
    "composed": true,
    "layoutStrategy": "cob-flow",
    "statusBind": "cob.order"
  },
  "children": [
    { "type": "CobFlow", "bind": "cob" }
  ]
}
```

**Preview locally:**

```bash
curl http://localhost:3001/v1/schema/compose/cob
```

---

### Example 2 — Deductible (`progress-dashboard`)

**Entity data arrives:**

```json
{
  "deductible": {
    "annual": 1500,
    "met": 920,
    "oopMax": 6000,
    "oopMet": 2100,
    "remaining": 580,
    "oopRemaining": 3900,
    "remainingLabel": "$580 left",
    "planYear": "2026"
  }
}
```

**Advisor reasoning:**

```
Detected progress pairs (met, oopMet) → ProgressPanel
```

**Composed schema (excerpt):**

```json
{
  "type": "WorkflowCard",
  "props": {
    "title": "Deductible & Out-of-Pocket",
    "panelId": "deductible",
    "layoutStrategy": "progress-dashboard",
    "statusBind": "deductible.remainingLabel"
  },
  "children": [
    {
      "type": "ProgressPanel",
      "bind": "deductible",
      "props": {
        "items": [
          { "key": "met", "label": "Annual deductible", "maxKey": "annual", "format": "currency" },
          { "key": "oopMet", "label": "Out-of-pocket max", "maxKey": "oopMax", "format": "currency" }
        ]
      }
    },
    {
      "type": "StatGrid",
      "bind": "deductible",
      "props": {
        "columns": 3,
        "metrics": [
          { "key": "remaining", "label": "Deductible left", "format": "currency", "variant": "warning" },
          { "key": "oopRemaining", "label": "OOP left", "format": "currency" },
          { "key": "planYear", "label": "Plan year" }
        ]
      }
    }
  ]
}
```

```bash
curl http://localhost:3001/v1/schema/compose/deductible
```

---

### Example 3 — Recent Claims (`tabular-with-summary`)

**Entity data arrives:**

```json
{
  "claims": {
    "summary": {
      "status": "denied",
      "lastAmount": 1240,
      "totalDenied": 2,
      "totalPaid": 3840,
      "denialReason": "Missing modifier 25 on E/M visit"
    },
    "rows": [
      { "date": "2026-05-14", "code": "99214", "amount": 1240, "status": "denied" },
      { "date": "2026-04-02", "code": "93000", "amount": 180, "status": "paid" }
    ]
  }
}
```

**Advisor reasoning:**

```
Detected tabular array → DataTable with summary stats
```

**Composed components:** `StatGrid` (summary metrics) → `DataTable` (`claims.rows`, columns inferred from first row) → `Alert` (denial reason).

```bash
curl http://localhost:3001/v1/schema/compose/claims
```

---

### Example 4 — Specialist Referral (`alert-split`)

**Entity data arrives:**

```json
{
  "referral": {
    "required": true,
    "specialist": "Dr. James Chen — Cardiology",
    "status": "missing",
    "visitsRemaining": 0,
    "alert": "No referral on file. Request from PCP before booking."
  }
}
```

**Advisor reasoning:**

```
Detected narrative field → Alert (referral.alert) with split stats
```

**Composed layout:** left column = `StatGrid` (booleans/numbers) or `Field` grid; right column = `Alert` bound to `referral.alert`.

```bash
curl http://localhost:3001/v1/schema/compose/referral
```

---

### Example 5 — Case Escalation (`escalation-split`)

**Entity data arrives:**

```json
{
  "escalation": {
    "level": "supervisor",
    "reason": "Multi-payer COB dispute + denied claim require supervisor review.",
    "assignedTo": "Claims Resolution Team",
    "sla": "4 business hours",
    "priority": "P1",
    "history": [
      { "time": "12:04 PM", "title": "Auto-escalated", "detail": "3 unresolved blockers", "status": "pending" }
    ]
  }
}
```

**Advisor reasoning:**

```
Detected history[] timeline + escalation fields → split layout
```

**Composed layout:** `Alert` (reason) + `Split` with `StatGrid` (queue, SLA, priority) and `Timeline` (`escalation.history`).

```bash
curl http://localhost:3001/v1/schema/compose/escalation
```

---

### Example 6 — Brand-new entity (`field-grid` fallback)

If a health system adds a novel entity with only scalar fields and no recognized patterns, the advisor falls back to `field-grid`. **No frontend change required.**

**Hypothetical entity data:**

```json
{
  "transportBenefit": {
    "ridesRemaining": 4,
    "maxMiles": 50,
    "requiresAuth": true,
    "planName": "Medicare Advantage Transport"
  }
}
```

**Advisor reasoning:**

```
Default → scalar field grid from ontology + data keys
Fallback composed 2 metrics + 2 fields from data shape
```

**Composed schema (conceptual):**

```json
{
  "type": "WorkflowCard",
  "props": { "title": "Transport Benefit", "panelId": "transportBenefit", "composed": true, "layoutStrategy": "field-grid" },
  "children": [
    {
      "type": "StatGrid",
      "bind": "transportBenefit",
      "props": {
        "metrics": [
          { "key": "ridesRemaining", "label": "Rides Remaining" },
          { "key": "requiresAuth", "label": "Requires Auth", "format": "boolean" }
        ]
      }
    },
    {
      "type": "Grid",
      "props": { "columns": 2 },
      "children": [
        { "type": "Field", "bind": "transportBenefit.maxMiles", "props": { "label": "Max Miles" } },
        { "type": "Field", "bind": "transportBenefit.planName", "props": { "label": "Plan Name" } }
      ]
    }
  ]
}
```

---

## WebSocket events after composition

When a new entity is composed and pushed, connected clients receive:

### `workflow.schema`

Full UI tree including the new `WorkflowCard` appended to the call schema.

```json
{
  "type": "workflow.schema",
  "payload": {
    "version": "4",
    "ontologyVersion": "1.0.3",
    "workflowId": "eligibility-check",
    "root": {
      "type": "Stack",
      "children": [
        { "type": "PatientHeader", "bind": "patient" },
        { "type": "ProviderCard", "bind": "provider" },
        { "type": "EligibilityTable", "bind": "eligibility.rows" },
        { "type": "AgentRecommendation", "bind": "agent.latest" },
        { "type": "WorkflowCard", "props": { "panelId": "cob", "composed": true, "...": "..." }, "children": ["..."] }
      ]
    }
  }
}
```

### `data.patch`

Full call state replace so new entity values are available for binding.

```json
{
  "type": "data.patch",
  "payload": [{ "op": "replace", "path": "", "value": { "patient": {}, "cob": { "primaryPayer": "Aetna", "...": "..." } } }]
}
```

### `ontology.updated`

```json
{
  "type": "ontology.updated",
  "payload": { "version": "1.0.3", "label": "Coordination of Benefits" }
}
```

### `platform.notice`

```json
{
  "type": "platform.notice",
  "payload": {
    "message": "Coordination of Benefits surfaced — layout \"cob-flow\" auto-composed from data",
    "ontologyVersion": "1.0.3",
    "schemaVersion": "4",
    "layoutStrategy": "cob-flow",
    "composed": true,
    "activeModules": ["priorAuth", "cob"]
  }
}
```

---

## API endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/v1/schema/compose/:moduleId` | Preview composed schema + reasoning for a workflow module |
| `GET` | `/v1/schema/strategies` | List layout strategies and advisor notes |
| `GET` | `/v1/ontology` | Current ontology (entities grow as modules surface) |
| `GET` | `/v1/calls/:callId/schema` | Live call UI schema |
| `GET` | `/v1/calls/:callId/state` | Live call data |

### Quick test matrix

```bash
curl http://localhost:3001/v1/schema/compose/priorAuth    # → alert-split
curl http://localhost:3001/v1/schema/compose/cob         # → cob-flow
curl http://localhost:3001/v1/schema/compose/deductible  # → progress-dashboard
curl http://localhost:3001/v1/schema/compose/claims      # → tabular-with-summary
curl http://localhost:3001/v1/schema/compose/scheduling  # → timeline-schedule
curl http://localhost:3001/v1/schema/compose/escalation  # → escalation-split
curl http://localhost:3001/v1/schema/strategies
```

---

## What the frontend does (and does not do)

| Does | Does not |
|------|----------|
| Hydrate schema + state on connect (REST) | Know about `priorAuth`, `cob`, or any specific entity |
| Listen for WebSocket events | Compose layouts |
| Walk schema tree via `SurfaceRenderer` | Redeploy when ontology changes |
| Map `type` → registry component | Generate React code at runtime |
| Fall back to `Unknown` for unregistered types | Call the layout advisor |

Registered component types live in `packages/surface-sdk/src/renderer.tsx` (`defaultRegistry`). New **visualization patterns** (e.g. a custom prior-auth timeline) require a registry addition — an occasional frontend release, not a weekly one per workflow.

---

## Schema merge semantics

When the same entity surfaces again (random re-pick in the PoC), the composer:

1. Finds existing panel by `panelId` in schema children
2. Replaces it with freshly composed schema
3. Merges updated entity data into call state

The base call chrome (`PatientHeader`, `ProviderCard`, `EligibilityTable`, `AgentRecommendation`) is never removed.

---

## Related docs

- [ARCHITECTURE_PROPOSAL.md](./ARCHITECTURE_PROPOSAL.md) — four-layer model (ontology, data, UI schema, design system)
- [ONTOLOGY.md](./ONTOLOGY.md) — bind paths and field metadata
- [APP_FLOW_SLIDES.md](./APP_FLOW_SLIDES.md) — demo walkthrough (multi-patient, agent actions)
- [TRADEOFFS.md](./TRADEOFFS.md) — SDUI vs alternatives, registry fallbacks

---

## One-line summary for stakeholder calls

> "When new entity data arrives, the server extends the ontology, a layout advisor picks a rendering strategy from the data shape, the schema composer builds a component tree from our registered primitives, and the console updates over WebSocket — no frontend redeploy, no hand-authored screen per workflow."
