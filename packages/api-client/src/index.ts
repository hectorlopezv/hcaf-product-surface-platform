import type { CallState, UISchema } from '@hcaf/surface-sdk';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ApiError(`Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { message?: string | string[] };
  if (!res.ok) {
    const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    throw new ApiError(msg ?? `Request failed (${res.status})`, res.status);
  }
  return data;
}

export const queryKeys = {
  calls: {
    all: ['calls'] as const,
    queue: (apiUrl: string) => [...queryKeys.calls.all, apiUrl, 'queue'] as const,
    session: (apiUrl: string, callId: string) =>
      [...queryKeys.calls.all, apiUrl, callId, 'session'] as const,
  },
  config: {
    all: ['config'] as const,
    workspace: (apiUrl: string, callId: string) =>
      [...queryKeys.config.all, apiUrl, callId, 'workspace'] as const,
  },
  analytics: {
    summary: (apiUrl: string) => ['analytics', apiUrl, 'summary'] as const,
  },
  schema: {
    compose: (apiUrl: string, moduleId: string) =>
      ['schema', apiUrl, moduleId, 'compose'] as const,
  },
};

export interface CallQueueItem {
  callId: string;
  patientName: string;
  memberId?: string;
  provider?: string;
  specialty?: string;
  status?: 'live' | 'waiting';
  activeModules?: number;
  schemaVersion?: string;
}

export interface WorkflowProgress {
  activeModules: string[];
  modules?: Array<{ id: string; title: string; status: string }>;
}

export interface CallSession {
  schema: UISchema;
  state: CallState;
  progress: WorkflowProgress;
  queue: CallQueueItem[];
}

export interface ConfigWorkspace {
  calls: CallQueueItem[];
  ontology: { version: string; entities: Record<string, { label: string; fields: Record<string, { type: string; label: string }> }> };
  strategies: string[];
  modules: Array<{
    id: string;
    title: string;
    entityKey: string;
    fields: Array<{ bind: string; label: string; fieldType?: string }>;
  }>;
  demoEntities: Array<{
    id: string;
    title: string;
    entityKey: string;
    description: string;
    expectedLayout: string;
    fieldCount: number;
  }>;
}

export interface AnalyticsSummary {
  generatedAt: string;
  totals: {
    activeCalls: number;
    liveCalls: number;
    totalActiveModules: number;
    pendingRecommendations: number;
    totalFeedbackEvents: number;
  };
  calls: Array<{
    callId: string;
    patientName: string;
    specialty: string;
    status: 'live' | 'waiting';
    activeModuleCount: number;
    agentStatus: string;
    schemaVersion: string;
    ontologyVersion: string;
    feedbackCount: number;
  }>;
  feedbackEvents: Array<{
    callId: string;
    patientName: string;
    action: string;
    moduleId: string;
    feedback: string;
    originalAction: string;
    timestamp: string;
  }>;
}

export interface SurfaceMutationResult {
  ok?: boolean;
  message?: string;
  layoutStrategy?: string;
  scenario?: string;
  ontologyVersion?: string;
  callId?: string;
  isNewEntityType?: boolean;
}

export interface ComposePreview {
  moduleId: string;
  title: string;
  layoutStrategy: string;
  reasoning: string[];
  schemaNode: unknown;
}

export function createApi(baseUrl: string) {
  const root = baseUrl.replace(/\/$/, '');

  return {
    getCallSession: async (callId: string): Promise<CallSession> => {
      const [schema, state, progress, queueRes] = await Promise.all([
        fetchJson<UISchema>(`${root}/v1/calls/${callId}/schema`),
        fetchJson<CallState>(`${root}/v1/calls/${callId}/state`),
        fetchJson<WorkflowProgress>(`${root}/v1/workflows/eligibility-check/progress?callId=${callId}`),
        fetchJson<{ calls: CallQueueItem[] }>(`${root}/v1/calls`),
      ]);
      return { schema, state, progress, queue: queueRes.calls ?? [] };
    },

    getConfigWorkspace: async (callId: string): Promise<ConfigWorkspace> => {
      const [queueRes, ontology, strat, workflow, demoRes] = await Promise.all([
        fetchJson<{ calls: CallQueueItem[] }>(`${root}/v1/calls`),
        fetchJson<ConfigWorkspace['ontology']>(`${root}/v1/ontology?callId=${callId}`),
        fetchJson<{ strategies: string[] }>(`${root}/v1/schema/strategies`),
        fetchJson<{ modules: ConfigWorkspace['modules'] }>(`${root}/v1/workflows/eligibility-check`),
        fetchJson<{ entities: ConfigWorkspace['demoEntities'] }>(`${root}/v1/config/demo-entities`),
      ]);
      return {
        calls: queueRes.calls ?? [],
        ontology,
        strategies: strat.strategies ?? [],
        modules: workflow.modules ?? [],
        demoEntities: demoRes.entities ?? [],
      };
    },

    getAnalyticsSummary: () => fetchJson<AnalyticsSummary>(`${root}/v1/analytics/summary`),

    composeModule: (moduleId: string) =>
      fetchJson<ComposePreview>(`${root}/v1/schema/compose/${moduleId}`),

    surfaceModule: (callId: string, moduleId: string) =>
      postJson<SurfaceMutationResult>(`${root}/v1/config/surface-module`, { callId, moduleId }),

    surfaceEntity: (callId: string, entityId: string) =>
      postJson<SurfaceMutationResult>(`${root}/v1/config/surface-entity`, { callId, entityId }),

    addOntologyField: (body: {
      callId: string;
      entityKey: string;
      fieldKey: string;
      label: string;
      fieldType: string;
    }) => postJson<SurfaceMutationResult>(`${root}/v1/config/ontology/field`, body),
  };
}

export type ApiClient = ReturnType<typeof createApi>;
