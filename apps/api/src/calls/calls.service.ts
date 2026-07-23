import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ELIGIBILITY_WORKFLOW_ID,
  ELIGIBILITY_WORKFLOW_STEPS,
  type WorkflowStepDef,
} from '../workflows/eligibility-workflow';
import { composeEntityPanel } from '../schema/schema-composer';
import { executeAgentAction } from './agent-actions';
import type { AgentRecommendation, CallState, UISchema, UISchemaNode } from '../types';
import { DEFAULT_CALL_ID, PATIENT_SEEDS, type PatientSeed } from './patient-seed';
import { personalizeAgent, personalizeModuleState, shuffleModuleIds } from '../workflows/workflow-random';
import { demoEntityToStep, getDemoEntity } from '../workflows/demo-entities';

const BASE_CHILDREN: UISchemaNode[] = [
  { type: 'PatientHeader', bind: 'patient' },
  { type: 'ProviderCard', bind: 'provider' },
  {
    type: 'EligibilityTable',
    bind: 'eligibility.rows',
    props: { columns: ['payer', 'status', 'copay', 'planTier'] },
  },
  { type: 'AgentRecommendation', bind: 'agent.latest' },
];

const DEFAULT_SCHEMA: UISchema = {
  version: '1',
  ontologyVersion: '1.0.0',
  workflowId: ELIGIBILITY_WORKFLOW_ID,
  root: { type: 'Stack', children: [...BASE_CHILDREN] },
};

const INITIAL_AGENT: AgentRecommendation = {
  text: 'Verifying eligibility — workflow modules will surface automatically as blockers are detected.',
  confidence: 0.87,
  action: 'Monitor live updates',
};

export interface ScenarioResult {
  callId: string;
  schema: UISchema;
  state: CallState;
  message: string;
  scenario: string;
  activeModules: string[];
  layoutStrategy?: string;
  composed?: boolean;
}

export interface OperatorActionResult {
  callId: string;
  message: string;
  state: CallState;
  schema: UISchema;
  schemaUpdated: boolean;
  patches: Array<{ path: string; value: unknown }>;
}

export interface CallQueueItem {
  callId: string;
  patientName: string;
  memberId: string;
  provider: string;
  specialty: string;
  status: 'live' | 'waiting';
  activeModules: number;
  schemaVersion: string;
}

interface CallSession {
  seed: PatientSeed;
  schema: UISchema;
  state: CallState;
  activeModuleIds: Set<string>;
  schemaRevision: number;
  currentScenario: string | null;
  moduleDeck: string[];
  deckCursor: number;
  deckCycle: number;
}

@Injectable()
export class CallsService {
  private sessions = new Map<string, CallSession>();

  constructor() {
    for (const seed of PATIENT_SEEDS) {
      this.sessions.set(seed.callId, this.createSession(seed));
    }
  }

  private createSession(seed: PatientSeed): CallSession {
    const { patient, provider, eligibility } = seed;
    return {
      seed,
      schema: structuredClone(DEFAULT_SCHEMA),
      state: {
        patient: structuredClone(patient),
        provider: structuredClone(provider),
        eligibility: structuredClone(eligibility),
        agent: { latest: { ...INITIAL_AGENT } },
      },
      activeModuleIds: new Set(),
      schemaRevision: 1,
      currentScenario: null,
      moduleDeck: shuffleModuleIds(
        ELIGIBILITY_WORKFLOW_STEPS.map((s) => s.id),
        seed.callId,
        0,
      ),
      deckCursor: 0,
      deckCycle: 0,
    };
  }

  private session(callId: string): CallSession {
    const s = this.sessions.get(callId);
    if (!s) throw new NotFoundException(`Unknown call: ${callId}`);
    return s;
  }

  listCalls(): CallQueueItem[] {
    return [...this.sessions.values()].map((s) => ({
      callId: s.seed.callId,
      patientName: String(s.state.patient.name),
      memberId: String(s.state.patient.memberId),
      provider: String(s.state.provider.name),
      specialty: String(s.state.provider.specialty),
      status: s.activeModuleIds.size > 0 ? 'live' : 'waiting',
      activeModules: s.activeModuleIds.size,
      schemaVersion: s.schema.version,
    }));
  }

  getCallIds(): string[] {
    return [...this.sessions.keys()];
  }

  getSchema(callId: string = DEFAULT_CALL_ID) {
    return this.session(callId).schema;
  }

  getState(callId: string = DEFAULT_CALL_ID) {
    return this.session(callId).state;
  }

  getActiveModules(callId: string = DEFAULT_CALL_ID): string[] {
    return [...this.session(callId).activeModuleIds];
  }

  getOntologyRevision(callId: string = DEFAULT_CALL_ID): string {
    return `1.0.${this.session(callId).activeModuleIds.size}`;
  }

  private panelId(node: UISchemaNode): string | undefined {
    return node.props?.panelId as string | undefined;
  }

  private workflowChildren(session: CallSession): UISchemaNode[] {
    return (session.schema.root.children ?? []).filter((c) => Boolean(this.panelId(c)));
  }

  patchState(callId: string, path: string, value: unknown) {
    const session = this.session(callId);
    const parts = path.split('.');
    const next = structuredClone(session.state) as unknown as Record<string, unknown>;
    let cursor: Record<string, unknown> = next;
    for (let i = 0; i < parts.length - 1; i++) {
      cursor = cursor[parts[i]] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]] = value;
    session.state = next as unknown as CallState;
    return session.state;
  }

  private refreshModulePanel(session: CallSession, moduleId: string): boolean {
    const def = ELIGIBILITY_WORKFLOW_STEPS.find((s) => s.id === moduleId);
    if (!def || !session.activeModuleIds.has(moduleId)) return false;

    const entityData = session.state[def.entityKey as keyof CallState] as Record<string, unknown> | undefined;
    if (!entityData || typeof entityData !== 'object') return false;

    const composed = composeEntityPanel({
      entityKey: def.entityKey,
      title: def.title,
      panelId: def.id,
      fields: def.fields,
      entityData,
    });

    const workflowPanels = this.workflowChildren(session).filter((c) => this.panelId(c) !== def.id);
    workflowPanels.push(composed.schemaNode);
    session.schemaRevision += 1;
    session.schema = {
      version: String(session.schemaRevision),
      ontologyVersion: this.getOntologyRevision(session.seed.callId),
      workflowId: ELIGIBILITY_WORKFLOW_ID,
      root: { type: 'Stack', children: [...BASE_CHILDREN, ...workflowPanels] },
    };
    return true;
  }

  handleOperatorAction(callId: string, action: string, feedback?: string): OperatorActionResult {
    const session = this.session(callId);
    const op = action === 'approve' || action === 'override' ? action : 'approve';

    if (session.state.agent.latest.status !== 'pending') {
      return {
        callId,
        message: 'No pending agent recommendation — approve or override the current suggestion first',
        state: session.state,
        schema: session.schema,
        schemaUpdated: false,
        patches: [],
      };
    }

    if (!session.currentScenario) {
      return {
        callId,
        message: 'No active workflow recommendation yet — wait for a module to surface',
        state: session.state,
        schema: session.schema,
        schemaUpdated: false,
        patches: [],
      };
    }

    if (op === 'override' && !feedback?.trim()) {
      return {
        callId,
        message: 'Override requires operator feedback',
        state: session.state,
        schema: session.schema,
        schemaUpdated: false,
        patches: [],
      };
    }

    session.state.agent.latest = { ...session.state.agent.latest, status: 'executing' };

    const execution = executeAgentAction(
      session.currentScenario,
      op,
      session.state as unknown as Record<string, unknown>,
      feedback,
    );

    const patches: Array<{ path: string; value: unknown }> = [];

    for (const [key, value] of Object.entries(execution.entityUpdates)) {
      (session.state as unknown as Record<string, unknown>)[key] = value;
      patches.push({ path: `/${key}`, value });
    }

    if (execution.eligibilityPatch) {
      session.state.eligibility.rows = execution.eligibilityPatch;
      patches.push({ path: '/eligibility/rows', value: execution.eligibilityPatch });
    }

    if (execution.feedback) {
      const log = session.state.agent.feedbackLog ?? [];
      session.state.agent.feedbackLog = [...log, execution.feedback];
      patches.push({ path: '/agent/feedbackLog', value: session.state.agent.feedbackLog });
    }

    session.state.agent.latest = execution.agent;
    patches.push({ path: '/agent/latest', value: execution.agent });

    const schemaUpdated = session.currentScenario
      ? this.refreshModulePanel(session, session.currentScenario)
      : false;

    const patientName = session.state.patient.name as string;
    return {
      callId,
      message: `${patientName}: ${execution.message}`,
      state: session.state,
      schema: session.schema,
      schemaUpdated,
      patches,
    };
  }

  private pickNextModule(session: CallSession): WorkflowStepDef {
    if (session.deckCursor >= session.moduleDeck.length) {
      session.deckCycle += 1;
      session.moduleDeck = shuffleModuleIds(
        ELIGIBILITY_WORKFLOW_STEPS.map((s) => s.id),
        session.seed.callId,
        session.deckCycle,
      );
      session.deckCursor = 0;
    }

    const moduleId = session.moduleDeck[session.deckCursor];
    session.deckCursor += 1;
    return ELIGIBILITY_WORKFLOW_STEPS.find((s) => s.id === moduleId)!;
  }

  advanceScenario(callId?: string): ScenarioResult {
    const targetCallId = callId ?? this.getCallIds()[Math.floor(Math.random() * this.getCallIds().length)];
    const session = this.session(targetCallId);
    const patientName = session.state.patient.name as string;

    const awaitingOperator =
      session.currentScenario !== null && session.state.agent.latest.status === 'pending';
    if (awaitingOperator) {
      return {
        callId: targetCallId,
        schema: session.schema,
        state: session.state,
        message: `${patientName}: awaiting operator decision on agent recommendation`,
        scenario: session.currentScenario!,
        activeModules: this.getActiveModules(targetCallId),
        composed: false,
      };
    }

    const def = this.pickNextModule(session);
    return this.applyWorkflowModule(targetCallId, def);
  }

  surfaceModule(callId: string, moduleId: string): ScenarioResult {
    const def = this.getStepDef(moduleId);
    if (!def) {
      throw new NotFoundException(`Unknown workflow module: ${moduleId}`);
    }
    return this.applyWorkflowModule(callId, def);
  }

  surfaceDemoEntity(callId: string, entityId: string): ScenarioResult {
    const demo = getDemoEntity(entityId);
    if (!demo) {
      throw new NotFoundException(`Unknown demo entity: ${entityId}`);
    }
    const result = this.applyWorkflowModule(callId, demoEntityToStep(demo));
    return {
      ...result,
      message: `${result.message} — NEW entity type "${demo.entityKey}" (not in eligibility-workflow.ts)`,
    };
  }

  addEntityField(callId: string, entityKey: string, fieldKey: string, label: string, fieldType = 'string') {
    const session = this.session(callId);
    const patientName = session.state.patient.name as string;
    const entity = (session.state as unknown as Record<string, unknown>)[entityKey];

    if (entity && typeof entity === 'object' && !Array.isArray(entity)) {
      (entity as Record<string, unknown>)[fieldKey] = fieldType === 'boolean' ? false : fieldType === 'number' ? 0 : '—';
    }

    const moduleId = [...session.activeModuleIds].find((id) => {
      const step = this.getStepDef(id);
      return step?.entityKey === entityKey;
    });

    let schemaUpdated = false;
    if (moduleId) {
      const step = this.getStepDef(moduleId)!;
      const existingField = step.fields.find((f) => f.bind === `${entityKey}.${fieldKey}`);
      if (!existingField) {
        step.fields.push({ bind: `${entityKey}.${fieldKey}`, label, fieldType });
      }
      schemaUpdated = this.refreshModulePanel(session, moduleId);
    }

    session.schemaRevision += 1;
    session.schema = {
      ...session.schema,
      version: String(session.schemaRevision),
      ontologyVersion: this.getOntologyRevision(callId),
    };

    return {
      callId,
      patientName,
      schema: session.schema,
      state: session.state,
      schemaUpdated,
      message: `${patientName}: field "${fieldKey}" added to ${entityKey}`,
    };
  }

  private applyWorkflowModule(callId: string, def: WorkflowStepDef): ScenarioResult {
    const session = this.session(callId);
    const patientName = session.state.patient.name as string;

    const isNew = !session.activeModuleIds.has(def.id);
    if (isNew) session.activeModuleIds.add(def.id);
    session.schemaRevision += 1;
    session.currentScenario = def.id;

    const personalized = personalizeModuleState(def, session.seed);
    const entityData = personalized[def.entityKey] as Record<string, unknown>;
    const composed = composeEntityPanel({
      entityKey: def.entityKey,
      title: def.title,
      panelId: def.id,
      fields: def.fields,
      entityData,
    });

    const workflowPanels = this.workflowChildren(session).filter((c) => this.panelId(c) !== def.id);
    workflowPanels.push(composed.schemaNode);

    session.schema = {
      version: String(session.schemaRevision),
      ontologyVersion: this.getOntologyRevision(callId),
      workflowId: ELIGIBILITY_WORKFLOW_ID,
      root: { type: 'Stack', children: [...BASE_CHILDREN, ...workflowPanels] },
    };

    const priorAgent = session.state.agent;
    const nextLatest = { ...personalizeAgent(def, session.seed), status: 'pending' as const };
    session.state = {
      ...session.state,
      ...personalized,
      agent: { ...priorAgent, latest: nextLatest },
    };

    const action = isNew ? 'surfaced' : 'updated';
    return {
      callId,
      schema: session.schema,
      state: session.state,
      message: `${patientName}: ${def.title} ${action} — layout "${composed.layoutStrategy}" auto-composed`,
      scenario: def.id,
      activeModules: this.getActiveModules(callId),
      layoutStrategy: composed.layoutStrategy,
      composed: true,
    };
  }

  resetDemo(callId: string = DEFAULT_CALL_ID): ScenarioResult {
    const session = this.session(callId);
    const fresh = this.createSession(session.seed);
    this.sessions.set(callId, fresh);
    const name = fresh.state.patient.name as string;
    return {
      callId,
      schema: fresh.schema,
      state: fresh.state,
      message: `Call reset — ${name}. Modules will surface automatically.`,
      scenario: 'reset',
      activeModules: [],
    };
  }

  getStepDef(id: string): WorkflowStepDef | undefined {
    const builtIn = ELIGIBILITY_WORKFLOW_STEPS.find((s) => s.id === id);
    if (builtIn) return builtIn;
    const demo = getDemoEntity(id);
    return demo ? demoEntityToStep(demo) : undefined;
  }

  getAnalyticsSummary() {
    const calls = [...this.sessions.entries()].map(([callId, session]) => {
      const latest = session.state.agent.latest;
      return {
        callId,
        patientName: String(session.state.patient.name),
        specialty: String(session.state.provider.specialty),
        status: session.activeModuleIds.size > 0 ? ('live' as const) : ('waiting' as const),
        activeModules: [...session.activeModuleIds],
        activeModuleCount: session.activeModuleIds.size,
        currentScenario: session.currentScenario,
        agentStatus: latest.status ?? 'monitoring',
        schemaVersion: session.schema.version,
        ontologyVersion: session.schema.ontologyVersion,
        feedbackCount: (session.state.agent.feedbackLog ?? []).length,
      };
    });

    const feedbackEvents = [...this.sessions.entries()].flatMap(([callId, session]) =>
      (session.state.agent.feedbackLog ?? []).map((entry) => ({
        callId,
        patientName: String(session.state.patient.name),
        action: 'override',
        moduleId: entry.scenario,
        feedback: entry.reason,
        originalAction: entry.originalAction,
        timestamp: entry.at,
      })),
    );

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        activeCalls: calls.length,
        liveCalls: calls.filter((c) => c.status === 'live').length,
        totalActiveModules: calls.reduce((n, c) => n + c.activeModuleCount, 0),
        pendingRecommendations: calls.filter((c) => c.agentStatus === 'pending').length,
        totalFeedbackEvents: feedbackEvents.length,
      },
      calls,
      feedbackEvents: [...feedbackEvents].reverse().slice(0, 20),
    };
  }
}
