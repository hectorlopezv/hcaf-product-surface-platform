import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, DataTable, SurfaceNav } from '@hcaf/ui';
import { env } from './env';

interface SurfaceResponse {
  ok?: boolean;
  message?: string;
  layoutStrategy?: string;
  scenario?: string;
  ontologyVersion?: string;
  callId?: string;
  isNewEntityType?: boolean;
  statusCode?: number;
}

async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as T & { message?: string | string[]; statusCode?: number };
    if (!res.ok) {
      const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
      return { ok: false, error: msg ?? `Request failed (${res.status})` };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Cannot reach API — run `pnpm dev` and ensure port 3001 is up.' };
  }
}

interface CallQueueItem {
  callId: string;
  patientName: string;
}

interface OntologyEntity {
  label: string;
  fields: Record<string, { type: string; label: string }>;
}

interface WorkflowModule {
  id: string;
  title: string;
  entityKey: string;
  fields: Array<{ bind: string; label: string; fieldType?: string }>;
}

interface ComposePreview {
  moduleId: string;
  title: string;
  layoutStrategy: string;
  reasoning: string[];
  schemaNode: unknown;
}

interface DemoEntityItem {
  id: string;
  title: string;
  entityKey: string;
  description: string;
  expectedLayout: string;
  fieldCount: number;
}

export function App() {
  const [callId, setCallId] = useState('call-maria');
  const [calls, setCalls] = useState<CallQueueItem[]>([]);
  const [ontology, setOntology] = useState<{ version: string; entities: Record<string, OntologyEntity> } | null>(null);
  const [strategies, setStrategies] = useState<string[]>([]);
  const [modules, setModules] = useState<WorkflowModule[]>([]);
  const [demoEntities, setDemoEntities] = useState<DemoEntityItem[]>([]);
  const [preview, setPreview] = useState<ComposePreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<'info' | 'success' | 'error'>('info');
  const [surfacingId, setSurfacingId] = useState<string | null>(null);
  const [surfaceResult, setSurfaceResult] = useState<SurfaceResponse | null>(null);
  const [entityKey, setEntityKey] = useState('priorAuth');
  const [fieldKey, setFieldKey] = useState('planTier');
  const [fieldLabel, setFieldLabel] = useState('Plan Tier');
  const [fieldType, setFieldType] = useState('string');

  const load = useCallback(async (id: string) => {
    const [queueRes, ont, strat, workflow, demoRes] = await Promise.all([
      fetch(`${env.apiUrl}/v1/calls`).then((r) => r.json()),
      fetch(`${env.apiUrl}/v1/ontology?callId=${id}`).then((r) => r.json()),
      fetch(`${env.apiUrl}/v1/schema/strategies`).then((r) => r.json()),
      fetch(`${env.apiUrl}/v1/workflows/eligibility-check`).then((r) => r.json()),
      fetch(`${env.apiUrl}/v1/config/demo-entities`).then((r) => r.json()),
    ]);
    setCalls(queueRes.calls ?? []);
    setOntology(ont);
    setStrategies(strat.strategies ?? []);
    setModules(workflow.modules ?? []);
    setDemoEntities(demoRes.entities ?? []);
  }, []);

  useEffect(() => {
    load(callId);
  }, [callId, load]);

  const surfaceModule = async (moduleId: string) => {
    setSurfacingId(moduleId);
    setSurfaceResult(null);
    const result = await postJson<SurfaceResponse>(`${env.apiUrl}/v1/config/surface-module`, { callId, moduleId });
    setSurfacingId(null);
    if (!result.ok) {
      setNoticeTone('error');
      setNotice(result.error);
      return;
    }
    setNoticeTone('success');
    setNotice(result.data.message ?? `Surfaced ${moduleId} on ${callId}`);
    setSurfaceResult(result.data);
    await load(callId);
  };

  const previewModule = async (moduleId: string) => {
    const res = await fetch(`${env.apiUrl}/v1/schema/compose/${moduleId}`).then((r) => r.json());
    setPreview(res);
  };

  const surfaceDemoEntity = async (entityId: string) => {
    setSurfacingId(entityId);
    setSurfaceResult(null);
    const result = await postJson<SurfaceResponse>(`${env.apiUrl}/v1/config/surface-entity`, { callId, entityId });
    setSurfacingId(null);
    if (!result.ok) {
      setNoticeTone('error');
      setNotice(result.error);
      return;
    }
    setNoticeTone('success');
    setNotice(result.data.message ?? `Surfaced new entity ${entityId} on ${callId}`);
    setSurfaceResult(result.data);
    await load(callId);
  };

  const addField = async () => {
    const result = await postJson<SurfaceResponse>(`${env.apiUrl}/v1/config/ontology/field`, {
      callId,
      entityKey,
      fieldKey,
      label: fieldLabel,
      fieldType,
    });
    if (!result.ok) {
      setNoticeTone('error');
      setNotice(result.error);
      return;
    }
    setNoticeTone('success');
    setNotice(result.data.message ?? 'Field added');
    setSurfaceResult(null);
    await load(callId);
  };

  const entityRows = ontology
    ? Object.entries(ontology.entities).flatMap(([key, entity]) =>
        Object.entries(entity.fields).map(([fk, field]) => ({
          entity: key,
          field: fk,
          type: field.type,
          label: field.label,
        })),
      )
    : [];

  const entityOptions = [
    ...new Set([
      ...Object.keys(ontology?.entities ?? {}),
      ...modules.map((m) => m.entityKey),
    ]),
  ];

  const selectedPatient = calls.find((c) => c.callId === callId)?.patientName ?? callId;
  const noticeStyles =
    noticeTone === 'error'
      ? { background: 'rgba(239,68,68,0.1)', color: 'var(--hcaf-danger)' }
      : noticeTone === 'success'
        ? { background: 'rgba(34,197,94,0.1)', color: 'var(--hcaf-success, #16a34a)' }
        : { background: 'rgba(59,130,246,0.1)', color: 'var(--hcaf-primary)' };

  return (
    <div className="hcaf-ui hcaf-ui--comfortable" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SurfaceNav active="config-tool" surfaces={env.surfaces} />
      <header style={{ padding: '16px 20px', borderBottom: '1px solid var(--hcaf-border)', background: 'var(--hcaf-surface)' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>HCAF Config Tooling</div>
        <div style={{ fontSize: 12, color: 'var(--hcaf-text-muted)', marginTop: 4 }}>
          Configure ontology + surface workflow modules on live calls — changes push to Operator Console via WebSocket
        </div>
      </header>

      {notice && (
        <div style={{ padding: '8px 20px', fontSize: 12, ...noticeStyles }}>
          {notice}
        </div>
      )}

      {surfaceResult?.layoutStrategy && (
        <div style={{ padding: '12px 20px', background: 'rgba(34,197,94,0.08)', borderBottom: '1px solid var(--hcaf-border)', fontSize: 12 }}>
          <strong>Panel pushed to Operator Console</strong> — patient <strong>{selectedPatient}</strong>, layout{' '}
          <code>{surfaceResult.layoutStrategy}</code>, ontology v{surfaceResult.ontologyVersion ?? '—'}.
          {' '}Scroll down in the console to see the new WorkflowCard.
          {' '}
          <a href={`${env.consoleUrl}?callId=${callId}`} target="_blank" rel="noreferrer" style={{ color: 'var(--hcaf-primary)' }}>
            Open Operator Console →
          </a>
        </div>
      )}

      <main style={{ flex: 1, padding: 20, maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <Card title="Target call">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--hcaf-text-muted)' }}>Push schema changes to:</label>
            <select
              value={callId}
              onChange={(e) => setCallId(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 'var(--hcaf-radius)', border: '1px solid var(--hcaf-border)', background: 'var(--hcaf-surface-elevated)', color: 'var(--hcaf-text)' }}
            >
              {calls.map((c) => (
                <option key={c.callId} value={c.callId}>{c.patientName} ({c.callId})</option>
              ))}
            </select>
          </div>
        </Card>

        <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
          <Card title="How schema extension works">
            <ol style={{ fontSize: 13, color: 'var(--hcaf-text-muted)', paddingLeft: 20, display: 'grid', gap: 8 }}>
              <li><strong>Surface a module</strong> — picks entity data, composes UI from layout advisor, pushes <code>workflow.schema</code> to the call.</li>
              <li><strong>Add ontology field</strong> — extends the entity catalog; if that module is already on the call, the panel re-composes with the new field.</li>
              <li><strong>Operator Console</strong> — thin renderer; no redeploy needed. New <code>type</code>s still need a registry entry.</li>
            </ol>
          </Card>

          <Card
            title="Demo: brand-new entity types (zero frontend code)"
            actions={<Badge variant="success">SDUI proof</Badge>}
          >
            <p style={{ fontSize: 13, color: 'var(--hcaf-text-muted)', marginBottom: 12 }}>
              These entities are <strong>not</strong> in <code>eligibility-workflow.ts</code> or the React app.
              Clicking <strong>Surface new entity</strong> extends the ontology, composes a panel from data shape, and pushes to the{' '}
              <strong>Operator Console</strong> (same patient selected above) — no deploy. Panels appear at the bottom of the call view.
            </p>
            <div style={{ display: 'grid', gap: 12 }}>
              {demoEntities.map((e) => (
                <div
                  key={e.id}
                  style={{
                    padding: 14,
                    borderRadius: 'var(--hcaf-radius)',
                    border: '2px solid var(--hcaf-primary)',
                    background: 'rgba(59,130,246,0.05)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 15 }}>{e.title}</strong>
                        <Badge variant="info">{e.entityKey}</Badge>
                        <Badge variant="default">→ {e.expectedLayout}</Badge>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--hcaf-text-muted)', marginTop: 8 }}>
                        {e.description}
                      </div>
                    </div>
                    <Button
                      onClick={() => surfaceDemoEntity(e.id)}
                      disabled={surfacingId !== null}
                    >
                      {surfacingId === e.id ? 'Surfacing…' : 'Surface new entity'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Workflow modules (seed catalog)" actions={<Badge variant="default">{modules.length} available</Badge>}>
            <div style={{ display: 'grid', gap: 8 }}>
              {modules.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: 12,
                    borderRadius: 'var(--hcaf-radius)',
                    border: '1px solid var(--hcaf-border)',
                    background: 'var(--hcaf-surface-elevated)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>{m.title}</strong>
                      <div style={{ fontSize: 12, color: 'var(--hcaf-text-muted)', marginTop: 4 }}>
                        {m.entityKey} · {m.fields.map((f) => f.bind).join(' · ')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button variant="ghost" onClick={() => previewModule(m.id)}>Preview</Button>
                      <Button onClick={() => surfaceModule(m.id)} disabled={surfacingId !== null}>
                        {surfacingId === m.id ? 'Surfacing…' : 'Surface on call'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {preview && (
            <Card title={`Composition preview — ${preview.title}`} actions={<Badge variant="info">{preview.layoutStrategy}</Badge>}>
              <div style={{ fontSize: 12, color: 'var(--hcaf-text-muted)', marginBottom: 8 }}>
                {preview.reasoning?.join(' · ')}
              </div>
              <pre style={{ fontSize: 11, overflow: 'auto', padding: 12, background: 'var(--hcaf-bg)', borderRadius: 'var(--hcaf-radius)', border: '1px solid var(--hcaf-border)' }}>
                {JSON.stringify(preview.schemaNode, null, 2)}
              </pre>
            </Card>
          )}

          <Card title="Extend ontology — add field" actions={ontology ? <Badge variant="info">v{ontology.version}</Badge> : undefined}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
              <label style={{ fontSize: 12 }}>
                Entity
                <select value={entityKey} onChange={(e) => setEntityKey(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 'var(--hcaf-radius)', border: '1px solid var(--hcaf-border)', background: 'var(--hcaf-surface-elevated)', color: 'var(--hcaf-text)' }}>
                  {entityOptions.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>
                Field key
                <input value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 'var(--hcaf-radius)', border: '1px solid var(--hcaf-border)', background: 'var(--hcaf-surface-elevated)', color: 'var(--hcaf-text)' }} />
              </label>
              <label style={{ fontSize: 12 }}>
                Label
                <input value={fieldLabel} onChange={(e) => setFieldLabel(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 'var(--hcaf-radius)', border: '1px solid var(--hcaf-border)', background: 'var(--hcaf-surface-elevated)', color: 'var(--hcaf-text)' }} />
              </label>
              <label style={{ fontSize: 12 }}>
                Type
                <select value={fieldType} onChange={(e) => setFieldType(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: 6, borderRadius: 'var(--hcaf-radius)', border: '1px solid var(--hcaf-border)', background: 'var(--hcaf-surface-elevated)', color: 'var(--hcaf-text)' }}>
                  {['string', 'number', 'boolean', 'currency', 'date', 'enum'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <Button onClick={addField}>Add field & push to call</Button>
          </Card>

          <Card title="Ontology registry (live)">
            {entityRows.length > 0 ? (
              <DataTable rows={entityRows} columns={['entity', 'field', 'type', 'label']} />
            ) : (
              <div style={{ color: 'var(--hcaf-text-muted)', fontSize: 13 }}>Loading…</div>
            )}
          </Card>

          <Card title="Layout strategies">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {strategies.map((s) => <Badge key={s} variant="info">{s}</Badge>)}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
