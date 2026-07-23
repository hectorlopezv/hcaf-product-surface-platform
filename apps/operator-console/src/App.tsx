import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import {
  SurfaceRenderer,
  applyDataPatch,
  type CallState,
  type Operation,
  type UISchema,
} from '@hcaf/surface-sdk';
import {
  createApi,
  queryKeys,
  type CallQueueItem,
  type WorkflowProgress,
} from '@hcaf/api-client';
import { Badge, StatusDot, SurfaceNav } from '@hcaf/ui';
import { DEFAULT_CALL_ID } from './default-call';
import { env } from './env';

const api = createApi(env.apiUrl);

export function App() {
  const queryClient = useQueryClient();
  const [callId, setCallId] = useState(
    () => new URLSearchParams(window.location.search).get('callId') ?? DEFAULT_CALL_ID,
  );
  const [schema, setSchema] = useState<UISchema | null>(null);
  const [state, setState] = useState<CallState | null>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [schemaVersion, setSchemaVersion] = useState('—');
  const [ontologyVersion, setOntologyVersion] = useState('—');
  const [workflow, setWorkflow] = useState<WorkflowProgress | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const callIdRef = useRef(callId);
  callIdRef.current = callId;

  const sessionQuery = useQuery({
    queryKey: queryKeys.calls.session(env.apiUrl, callId),
    queryFn: () => api.getCallSession(callId),
  });

  useEffect(() => {
    if (!sessionQuery.data) return;
    const { schema: s, state: d, progress } = sessionQuery.data;
    setSchema(s);
    setState(d);
    setSchemaVersion(s.version);
    setOntologyVersion(s.ontologyVersion);
    setWorkflow(progress);
    if (sessionQuery.isSuccess && !notice) {
      setNotice('Select a patient from the queue. Workflow updates arrive via WebSocket.');
    }
  }, [sessionQuery.data, sessionQuery.isSuccess, notice]);

  useEffect(() => {
    const socket = io(env.wsUrl, { query: { callId } });
    socketRef.current = socket;

    socket.on('connect', () => setStatus('live'));
    socket.on('disconnect', () => setStatus('offline'));

    socket.on('message', (msg: { type: string; payload: unknown }) => {
      if (msg.type === 'call.queue') {
        const p = msg.payload as { calls: CallQueueItem[] };
        queryClient.setQueryData(
          queryKeys.calls.session(env.apiUrl, callIdRef.current),
          (prev) => (prev ? { ...prev, queue: p.calls ?? [] } : prev),
        );
        return;
      }

      if (msg.type === 'data.patch') {
        const ops = msg.payload as Operation[];
        const patchCallId = Array.isArray(ops)
          ? undefined
          : (msg.payload as { callId?: string }).callId;
        if (patchCallId && patchCallId !== callIdRef.current) return;

        const fullReplace = ops.find((o): o is Operation & { value: CallState } => o.path === '' && o.op === 'replace');
        if (fullReplace) {
          setState(fullReplace.value as CallState);
        } else {
          setState((prev) => (prev ? applyDataPatch(prev, ops) : prev));
        }
        return;
      }

      const payload = msg.payload as { callId?: string };
      const forActiveCall = !payload.callId || payload.callId === callIdRef.current;

      if (msg.type === 'workflow.schema' && forActiveCall) {
        const s = msg.payload as UISchema;
        setSchema(s);
        setSchemaVersion(s.version);
        setOntologyVersion(s.ontologyVersion);
      }
      if (msg.type === 'agent.recommendation' && forActiveCall) {
        const rec = msg.payload as CallState['agent']['latest'];
        setState((prev) => (prev ? { ...prev, agent: { latest: rec } } : prev));
      }
      if (msg.type === 'ontology.updated' && forActiveCall) {
        const ont = msg.payload as { version: string };
        setOntologyVersion(ont.version);
      }
      if (msg.type === 'workflow.progress' && forActiveCall) {
        setWorkflow(msg.payload as WorkflowProgress);
      }
      if (msg.type === 'platform.notice') {
        const n = msg.payload as {
          message: string;
          callId?: string;
          ontologyVersion?: string;
          schemaVersion?: string;
          activeModules?: string[];
        };
        if (!n.callId || n.callId === callIdRef.current) {
          setNotice(n.message);
          if (n.ontologyVersion) setOntologyVersion(n.ontologyVersion);
          if (n.schemaVersion) setSchemaVersion(n.schemaVersion);
          if (n.activeModules) setWorkflow((prev) => ({ ...prev, activeModules: n.activeModules! }));
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [callId, queryClient]);

  const switchCall = (nextCallId: string) => {
    if (nextCallId === callIdRef.current) return;
    callIdRef.current = nextCallId;
    setCallId(nextCallId);
    socketRef.current?.emit('call.switch', { callId: nextCallId });
    void queryClient.invalidateQueries({ queryKey: queryKeys.calls.session(env.apiUrl, nextCallId) });
  };

  const onAction = useCallback((action: string, payload?: unknown) => {
    const body = payload && typeof payload === 'object'
      ? { action, ...(payload as Record<string, unknown>) }
      : { action };
    socketRef.current?.emit('operator.action', body);
  }, []);

  const callQueue = sessionQuery.data?.queue ?? [];
  const activePatient = callQueue.find((c) => c.callId === callId);
  const activeTitles =
    workflow?.modules?.filter((m) => m.status === 'active').map((m) => m.title) ??
    workflow?.activeModules ??
    [];

  return (
    <div className="hcaf-ui hcaf-ui--compact" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SurfaceNav active="operator-console" surfaces={env.surfaces} />
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          borderBottom: '1px solid var(--hcaf-border)',
          background: 'var(--hcaf-surface)',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>HCAF Operator Console</div>
          <div style={{ fontSize: 11, color: 'var(--hcaf-text-muted)', marginTop: 2 }}>
            {callQueue.length} active calls · {activePatient?.patientName ?? callId}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <StatusDot status={status} />
          <span style={{ fontSize: 11, color: 'var(--hcaf-text-muted)' }}>
            Schema v{schemaVersion} · Ontology v{ontologyVersion}
          </span>
          {activeTitles.length > 0 && (
            <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {activeTitles.map((t) => (
                <Badge key={t} variant="info">{t}</Badge>
              ))}
            </span>
          )}
        </div>
      </header>

      {notice && (
        <div style={{ padding: '8px 20px', background: 'rgba(59,130,246,0.1)', color: 'var(--hcaf-primary)', fontSize: 12 }}>
          {notice}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside
          style={{
            width: 240,
            borderRight: '1px solid var(--hcaf-border)',
            background: 'var(--hcaf-surface)',
            padding: '12px 0',
            overflowY: 'auto',
          }}
        >
          <div style={{ padding: '0 12px 8px', fontSize: 10, fontWeight: 600, color: 'var(--hcaf-text-muted)', textTransform: 'uppercase' }}>
            Patient queue
          </div>
          {callQueue.map((c) => {
            const selected = c.callId === callId;
            return (
              <button
                key={c.callId}
                type="button"
                onClick={() => switchCall(c.callId)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  border: 'none',
                  borderLeft: selected ? '3px solid var(--hcaf-primary)' : '3px solid transparent',
                  background: selected ? 'rgba(59,130,246,0.08)' : 'transparent',
                  cursor: 'pointer',
                  color: 'var(--hcaf-text)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: selected ? 700 : 500 }}>{c.patientName}</div>
                <div style={{ fontSize: 10, color: 'var(--hcaf-text-muted)', marginTop: 2 }}>
                  {c.memberId} · {c.specialty}
                </div>
                <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                  <Badge variant={c.status === 'live' ? 'success' : 'default'}>{c.status}</Badge>
                  {(c.activeModules ?? 0) > 0 && <Badge variant="info">{c.activeModules} modules</Badge>}
                </div>
              </button>
            );
          })}
        </aside>

        <main style={{ flex: 1, padding: 20, overflowY: 'auto', maxWidth: 960 }}>
          {sessionQuery.isPending ? (
            <div style={{ color: 'var(--hcaf-text-muted)' }}>Loading call session…</div>
          ) : sessionQuery.isError ? (
            <div style={{ color: 'var(--hcaf-danger)' }}>Failed to load call session.</div>
          ) : schema && state ? (
            <SurfaceRenderer schema={schema} data={state} onAction={onAction} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
