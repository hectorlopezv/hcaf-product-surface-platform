# HCAF Operator Console — App Flow (Slide Deck)

Use this deck to walk through the PoC in interviews or stakeholder calls.  
**Demo URL:** http://localhost:5173 · **API:** http://localhost:3001

---

## Slide 1 — Title

# HCAF Product-Surface Platform
### Operator Console PoC — End-to-End Flow

- UI: React Operator Console (`:5173`)
- API: NestJS + Socket.io (`:3001`)
- Packages: `@hcaf/ontology` · `@hcaf/ui` · `@hcaf/surface-sdk`

---

## Slide 2 — The Problem

Health-system operators need to:

- See **dense, fast-changing data** during live calls
- Act on **agent recommendations** in seconds — with real backend effects
- Adapt when the **ontology evolves** (new payers, workflows, fields)
- Handle **multiple concurrent patients** without context loss
- Do it **without a frontend release** for every change

---

## Slide 3 — Two Apps, One System

```
┌─────────────────────────┐         ┌─────────────────────────┐
│   Operator Console      │  ◄───►  │      NestJS API         │
│   localhost:5173        │  REST   │   localhost:3001        │
│                         │  + WS   │                         │
│   "How it looks"        │         │   "What is true"        │
└─────────────────────────┘         └─────────────────────────┘
```

| App | Role |
|-----|------|
| **UI** | Thin renderer — patient queue, WebSocket client, operator clicks |
| **API** | Owns schema, state, ontology, workflow engine, agent action execution |

---

## Slide 4 — Four Layers

```
  Ontology          →  What CAN exist (Patient, Eligibility, PriorAuth)
       ↓
  Data (state)      →  What DOES exist right now (Maria, Aetna, agent rec)
       ↓
  UI Schema         →  HOW to show it (component tree + bind paths)
       ↓
  Design System     →  HOW it looks (@hcaf/ui tokens, cards, badges)
```

**Key idea:** Ontology and UI schema can change without redeploying React. Layout is **composed at runtime** from entity data shape — see [SCHEMA_COMPOSITION.md](./SCHEMA_COMPOSITION.md).

---

## Slide 5 — Monorepo Map

```
apps/
  operator-console/     ← React UI (patient queue + SurfaceRenderer)
  api/                  ← NestJS backend + workflow engine

packages/
  ontology/             ← Entity definitions (Patient, Eligibility…)
  ui/                   ← Shared design system (Card, Button, Badge…)
  surface-sdk/          ← SDUI renderer + WebSocket session helpers
```

---

## Slide 6 — Flow Overview (6 phases)

1. **Load** — UI fetches schema + state + call queue (REST)
2. **Render** — SurfaceRenderer draws the screen from server schema
3. **Connect** — WebSocket joins active call room
4. **Stream** — API pushes workflow modules, eligibility patches, notices
5. **Decide** — Operator approves or overrides agent recommendation
6. **Execute** — Server updates entities, re-composes panels, pushes state

---

## Slide 7 — Phase 1: Page Load (REST)

**User opens** http://localhost:5173

**UI fetches:**

```
GET /v1/calls                              →  patient queue (5 live calls)
GET /v1/calls/call-maria/schema            →  HOW to render
GET /v1/calls/call-maria/state             →  WHAT data to show
GET /v1/workflows/eligibility-check/progress?callId=call-maria
```

**Default call:** `call-maria` (Maria Gonzalez). Operator can switch patients via sidebar.

---

## Slide 8 — Multi-Patient Queue

Five concurrent call sessions run independently:

| Call ID | Patient | Specialty |
|---------|---------|-----------|
| `call-maria` | Maria Gonzalez | Cardiology |
| `call-robert` | Robert Kim | Orthopedics |
| `call-elena` | Elena Vasquez | Primary Care |
| `call-james` | James Wilson | Endocrinology |
| `call-patricia` | Patricia Moore | Rheumatology |

Each call has its own schema, state, ontology revision, and WebSocket room. Switching patients emits `call.switch` and hydrates that call's snapshot.

---

## Slide 9 — What the API Returns (Schema)

**UI Schema** = layout recipe (no hardcoded JSX per workflow)

```json
{
  "version": "4",
  "ontologyVersion": "1.0.2",
  "root": {
    "type": "Stack",
    "children": [
      { "type": "PatientHeader", "bind": "patient" },
      { "type": "ProviderCard", "bind": "provider" },
      { "type": "EligibilityTable", "bind": "eligibility.rows" },
      { "type": "AgentRecommendation", "bind": "agent.latest" },
      { "type": "WorkflowCard", "props": { "panelId": "priorAuth", "composed": true }, "children": ["…"] }
    ]
  }
}
```

Workflow panels (`WorkflowCard`) are **auto-composed** — not hand-authored in the frontend.

---

## Slide 10 — What the API Returns (State)

**Call State** = live data for this call (personalized per patient seed)

```json
{
  "patient": { "name": "Maria Gonzalez", "memberId": "M-4829103" },
  "provider": { "name": "Dr. James Chen", "specialty": "Cardiology" },
  "eligibility": { "rows": [
    { "payer": "Aetna", "status": "active", "copay": 25, "planTier": "Gold" },
    { "payer": "Medicare", "status": "pending", "copay": 0, "planTier": "Part B" }
  ]},
  "priorAuth": { "required": true, "status": "not_started", "authNumber": "PA-2026-88421" },
  "agent": {
    "latest": {
      "text": "Aetna prior auth required for Cardiology visit — Maria Gonzalez.",
      "confidence": 0.94,
      "action": "Submit prior auth request",
      "status": "pending"
    },
    "feedbackLog": []
  }
}
```

Module field values are **personalized per patient** (payer names, amounts, provider, procedures).

---

## Slide 11 — Phase 2: Rendering

```
schema + state
      ↓
SurfaceRenderer (surface-sdk)
      ↓
Walk schema tree → lookup type in Component Registry
      ↓
PatientHeader / EligibilityTable / WorkflowCard / AgentRecommendation…
      ↓
@hcaf/ui primitives (Card, Field, Badge, Button, ProgressBar, Timeline…)
```

**UI never hardcodes** workflow panels — the server composes them from entity data shape.

---

## Slide 12 — Component Registry

| Schema `type` | Registry maps to | Data via `bind` |
|---------------|------------------|-----------------|
| `PatientHeader` | Patient card | `patient` |
| `ProviderCard` | Provider card | `provider` |
| `EligibilityTable` | Data table | `eligibility.rows` |
| `AgentRecommendation` | Agent panel + Approve/Override | `agent.latest` |
| `WorkflowCard` | Composed workflow panel | child binds |
| `CobFlow`, `StatGrid`, `Timeline`, `DataTable`, `Alert` | Rich visualizations | entity paths |

Unknown type → fallback component (never white-screen).

---

## Slide 13 — Phase 3: WebSocket Connect

**Right after REST load:**

```
UI  →  socket.io connect to :3001?callId=call-maria
API →  client joins room "call-maria"
API →  sends workflow.schema + full state snapshot
UI  →  header shows green "Live call"
```

**Switch patient:**

```
UI  →  emit call.switch { callId: "call-robert" }
API →  leave old room, join new room, send snapshot
```

---

## Slide 14 — Phase 4: Server-Driven Workflow (no manual buttons)

The workflow engine runs **on the server** — the UI does not have "Add step" buttons.

| Trigger | Interval | What happens |
|---------|----------|--------------|
| Eligibility tick | every 3s | `data.patch` on `/eligibility/rows` (Medicare status flips) |
| Workflow advance | every 7s per call | New module surfaces from per-patient shuffled deck |
| Initial stagger | on boot | Each patient gets a first module at offset timing |

**While agent recommendation is `pending`**, workflow **pauses** for that call until the operator decides.

Each patient gets a **different module order** and **personalized entity data** — not identical canned panels.

---

## Slide 15 — WebSocket Event Contract

**Server → client:**

```json
{ "type": "workflow.schema",       "payload": { /* full UI schema */ } }
{ "type": "data.patch",            "payload": [ /* JSON Patch or full replace */ ] }
{ "type": "agent.recommendation",  "payload": { "text", "confidence", "action", "status", "outcome?" } }
{ "type": "ontology.updated",      "payload": { "version": "1.0.3", "label": "Prior Authorization" } }
{ "type": "workflow.progress",     "payload": { "callId", "activeModules", "modules": [...] } }
{ "type": "call.queue",            "payload": { "calls": [ /* queue items */ ] } }
{ "type": "platform.notice",       "payload": { "callId", "message", "layoutStrategy?" } }
```

**Client → server:**

```json
{ "action": "approve" }
{ "action": "override", "feedback": "Patient already has PA on file from last visit" }
{ "callId": "call-robert" }   // call.switch
```

---

## Slide 16 — Phase 5: Agent Recommendation (real execution)

**Approve** is not a cosmetic button flip. The server executes scenario-specific logic:

```
Operator clicks "Approve"
      ↓
UI emits operator.action { action: "approve" }  (no optimistic local update)
      ↓
API sets agent status → executing (brief UI feedback)
      ↓
agent-actions.ts runs handler for current module (e.g. priorAuth)
      → updates entity state (status, authNumber, deductible, etc.)
      → re-composes workflow panel from new data
      → sets follow-up agent message
      ↓
API pushes workflow.schema + full state replace + platform.notice
      ↓
UI shows "approved", entity panel reflects server changes
      ↓
~3s later: next workflow module surfaces for this call
```

**Example (approve prior auth):** `priorAuth.status` → `submitted`, auth number assigned, panel re-composed, agent says *"Prior authorization submitted successfully…"*

---

## Slide 17 — Phase 5b: Override with operator feedback

```
Operator clicks "Override"
      ↓
UI shows feedback textarea (min 3 characters)
      ↓
UI emits operator.action { action: "override", feedback: "…" }
      ↓
API logs feedback to agent.feedbackLog (audit trail)
      → applies override handler (waive PA, waive referral, etc.)
      → embeds reason in entity fields + agent.outcome
      ↓
API pushes full state + notice
```

Override without feedback is rejected server-side.

**Override = rejection.** The operator disagrees with the AI and must document why. This is human-in-the-loop governance — not optional in regulated healthcare workflows. Events appear in `agent.feedbackLog` and Analytics `feedbackEvents`.

---

## Slide 17b — SDUI: what avoids redeploy

| No redeploy needed | Mechanism |
|--------------------|-----------|
| New workflow (prior auth, COB…) | Server composes panel → `workflow.schema` |
| New fields (`planTier`, `authNumber`) | Ontology extend + re-compose |
| Layout change (table vs timeline) | `adviseLayout()` from data shape |
| Brand-new entity | `field-grid` fallback + generic primitives |

**Registry ≠ one React page per workflow.** ~15 primitives (`Field`, `DataTable`, `Timeline`…) composed at runtime — like HTML, not bespoke screens.

**Code changes are rare** — only when a visualization pattern does not exist in the registry. See [SDUI_AND_AGENT_MODEL.md](./SDUI_AND_AGENT_MODEL.md).

---

## Slide 17c — Config Tooling surfaces schema (no deploy)

```
Config Tooling (:5174)
  → POST /v1/config/surface-module { callId, moduleId }
  → POST /v1/config/ontology/field { entityKey, fieldKey, label }
       ↓
API composes schema + extends ontology
       ↓
WebSocket push to Operator Console (:5173)
       ↓
Analytics (:5175) observes override audit log
```

`eligibility-workflow.ts` is PoC seed data — production uses config store or agent triggers.

---

## Slide 18 — Runtime Schema Composition

When a workflow module surfaces:

```
Workflow step (data only) → personalizeModuleState() per patient
       ↓
adviseLayout() picks strategy from data shape (7 strategies)
       ↓
composeEntityPanel() builds WorkflowCard + children
       ↓
Append to call schema → WebSocket push
```

**10 module types:** priorAuth, referral, cob, deductible, pharmacy, claims, oon, scheduling, consent, escalation.

See [SCHEMA_COMPOSITION.md](./SCHEMA_COMPOSITION.md) for full pipeline and examples.

---

## Slide 19 — What Is Mock vs Real

| Piece | PoC | Production |
|-------|-----|------------|
| Initial patient seeds | Mock (5 patients) | EHR / agent platform |
| REST + WebSocket contract | ✅ Functional | ✅ Same pattern |
| Runtime schema composition | ✅ Functional | Workflow engine publishes |
| Agent action execution | ✅ Functional (in-memory) | HCAF agent runtime + integrations |
| Override feedback log | ✅ In call state + server console | Audit DB |
| Persistence | In-memory per session | Database |
| Workflow simulator | Timer-based (3s / 7s) | Event-driven from real blockers |

**Mock data = starting seeds only. API behavior is production-shaped.**

---

## Slide 20 — Full Sequence (One Diagram)

```
OPEN PAGE
  │ REST: queue + schema + state
  ▼
RENDER (SurfaceRenderer + @hcaf/ui)
  │ WebSocket: connect call-maria
  ▼
LIVE CALL (server-driven)
  │◄── workflow.schema (new composed module)
  │◄── data.patch (eligibility)
  │◄── platform.notice
  │──► operator.action (approve / override + feedback)
  │◄── full state + schema refresh (entity updated)
  ▼
NEXT MODULE (~3s after operator acts)
  │◄── workflow.schema (next blocker)
  ▼
SWITCH PATIENT (sidebar)
  │──► call.switch
  │◄── snapshot for other call's independent state
```

---

## Slide 21 — Key Files Cheat Sheet

| What | Where |
|------|-------|
| UI entry + WebSocket + queue | `apps/operator-console/src/App.tsx` |
| Component registry + renderer | `packages/surface-sdk/src/renderer.tsx` |
| Design system | `packages/ui/src/index.tsx` |
| Call sessions + workflow advance | `apps/api/src/calls/calls.service.ts` |
| Agent approve/override handlers | `apps/api/src/calls/agent-actions.ts` |
| Per-patient module shuffle + personalize | `apps/api/src/workflows/workflow-random.ts` |
| Layout advisor + schema composer | `apps/api/src/schema/schema-composer.ts` |
| WebSocket + simulators | `apps/api/src/main.ts` |
| WebSocket broadcast helpers | `apps/api/src/calls/call-broadcast.ts` |
| Admin / demo endpoints | `apps/api/src/admin/admin.module.ts` |
| Patient seeds | `apps/api/src/calls/patient-seed.ts` |

---

## Slide 22 — Interview Sound Bite

> "The API owns schema, state, and workflow logic; the UI is a thin renderer. Five concurrent calls each get personalized modules from a shuffled deck. When a blocker surfaces, the server composes the panel from entity data shape, pushes it over WebSocket, and waits for the operator to approve or override — which executes real state changes on the server, not a button flip. Mock data is only the initial seed; the contract is production-shaped."

---

## Slide 23 — Try It Yourself

```bash
cd prueba_golabs
pnpm install
pnpm dev
```

1. Open http://localhost:5173
2. Watch modules surface automatically per patient (different modules per call)
3. Wait for **Agent Recommendation** status `pending`
4. Click **Approve** — watch entity panel + notice update from server
5. Click **Override** — enter a reason (3+ chars) → submit → see `feedbackLog` + outcome
6. Switch patients in the sidebar — each call evolves independently

**Useful API calls:**

```bash
curl http://localhost:3001/v1/calls
curl http://localhost:3001/v1/calls/call-maria/state
curl http://localhost:3001/v1/schema/compose/priorAuth
curl -X POST 'http://localhost:3001/v1/admin/advance-scenario?callId=call-maria'
curl -X POST 'http://localhost:3001/v1/admin/reset?callId=call-maria'
```

---

## Related docs

- [SDUI_AND_AGENT_MODEL.md](./SDUI_AND_AGENT_MODEL.md) — SDUI mental model + agent governance (authoritative)
- [SCHEMA_COMPOSITION.md](./SCHEMA_COMPOSITION.md) — runtime layout composition
- [HCAF.md](./HCAF.md) — company context
- [ONTOLOGY.md](./ONTOLOGY.md) — ontology explained simply
- [DISCUSSION_GUIDE.md](./DISCUSSION_GUIDE.md) — stakeholder call playbook
- [ARCHITECTURE_PROPOSAL.md](./ARCHITECTURE_PROPOSAL.md) — full architecture
- [TRADEOFFS.md](./TRADEOFFS.md) — ADR trade-offs
