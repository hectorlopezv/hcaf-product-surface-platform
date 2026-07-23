import type { ComponentType } from 'react';
import { applyPatch, type Operation } from 'fast-json-patch';
import { getByPath } from '@hcaf/ontology';

export type { Operation };

export interface UISchemaNode {
  type: string;
  bind?: string;
  props?: Record<string, unknown>;
  children?: UISchemaNode[];
}

export interface UISchema {
  version: string;
  ontologyVersion: string;
  workflowId: string;
  root: UISchemaNode;
}

export interface AgentRecommendation {
  text: string;
  confidence: number;
  action: string;
  status?: 'pending' | 'approved' | 'overridden' | 'executing';
  outcome?: string;
}

export interface OperatorFeedback {
  scenario: string;
  reason: string;
  originalAction: string;
  at: string;
}

export interface CallState {
  patient: Record<string, unknown>;
  provider: Record<string, unknown>;
  eligibility: { rows: Array<Record<string, unknown>> };
  agent: {
    latest: AgentRecommendation;
    feedbackLog?: OperatorFeedback[];
  };
  priorAuth?: Record<string, unknown>;
}

export type SurfaceEventMap = {
  'workflow.schema': UISchema;
  'data.patch': Operation[];
  'agent.recommendation': AgentRecommendation;
  'ontology.updated': { version: string };
};

export interface RegistryComponentProps {
  node: UISchemaNode;
  data: CallState;
  onAction?: (action: string, payload?: unknown) => void;
  registry: ComponentRegistry;
}

export type ComponentRegistry = Record<string, ComponentType<RegistryComponentProps>>;

export function createSurfaceSession(config: {
  apiUrl: string;
  wsUrl: string;
  callId: string;
}) {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();

  const session = {
    config,
    on<K extends keyof SurfaceEventMap>(event: K, handler: (payload: SurfaceEventMap[K]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler as (payload: unknown) => void);
      return () => listeners.get(event)?.delete(handler as (payload: unknown) => void);
    },
    emit(event: string, payload: unknown) {
      listeners.get(event)?.forEach((h) => h(payload));
    },
    async fetchSchema(): Promise<UISchema> {
      const res = await fetch(`${config.apiUrl}/v1/calls/${config.callId}/schema`);
      if (!res.ok) throw new Error('Failed to fetch schema');
      return res.json();
    },
    async fetchState(): Promise<CallState> {
      const res = await fetch(`${config.apiUrl}/v1/calls/${config.callId}/state`);
      if (!res.ok) throw new Error('Failed to fetch state');
      return res.json();
    },
    sendOperatorAction(action: string, payload?: unknown) {
      const ws = (session as { ws?: WebSocket }).ws;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'operator.action', action, payload }));
      }
    },
    connect() {
      const ws = new WebSocket(`${config.wsUrl}?callId=${config.callId}`);
      (session as { ws?: WebSocket }).ws = ws;
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as { type: string; payload: unknown };
        session.emit(msg.type, msg.payload);
      };
      return ws;
    },
  };

  return session;
}

export function applyDataPatch(state: CallState, operations: Operation[]): CallState {
  const cloned = structuredClone(state);
  applyPatch(cloned, operations, true, false);
  return cloned;
}

export function resolveBind(data: CallState, bind?: string): unknown {
  if (!bind) return undefined;
  return getByPath(data as unknown as Record<string, unknown>, bind);
}
