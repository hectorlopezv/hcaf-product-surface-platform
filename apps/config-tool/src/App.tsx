import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, createApi, queryKeys, type ComposePreview, type SurfaceMutationResult } from '@hcaf/api-client';
import { Badge, Button, Card, DataTable, SurfaceNav } from '@hcaf/ui';
import { env } from './env';

const api = createApi(env.apiUrl);

export function App() {
  const queryClient = useQueryClient();
  const [callId, setCallId] = useState('call-maria');
  const [preview, setPreview] = useState<ComposePreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<'info' | 'success' | 'error'>('info');
  const [surfaceResult, setSurfaceResult] = useState<SurfaceMutationResult | null>(null);
  const [entityKey, setEntityKey] = useState('priorAuth');
  const [fieldKey, setFieldKey] = useState('planTier');
  const [fieldLabel, setFieldLabel] = useState('Plan Tier');
  const [fieldType, setFieldType] = useState('string');

  const workspaceQuery = useQuery({
    queryKey: queryKeys.config.workspace(env.apiUrl, callId),
    queryFn: () => api.getConfigWorkspace(callId),
  });

  const invalidateWorkspace = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.config.workspace(env.apiUrl, callId) });

  const surfaceModuleMutation = useMutation({
    mutationFn: (moduleId: string) => api.surfaceModule(callId, moduleId),
    onSuccess: (data) => {
      setNoticeTone('success');
      setNotice(data.message ?? 'Module surfaced on call');
      setSurfaceResult(data);
      void invalidateWorkspace();
    },
    onError: (error) => {
      setNoticeTone('error');
      setNotice(error instanceof ApiError ? error.message : 'Surface module failed');
    },
  });

  const surfaceEntityMutation = useMutation({
    mutationFn: (entityId: string) => api.surfaceEntity(callId, entityId),
    onSuccess: (data) => {
      setNoticeTone('success');
      setNotice(data.message ?? 'Entity surfaced on call');
      setSurfaceResult(data);
      void invalidateWorkspace();
    },
    onError: (error) => {
      setNoticeTone('error');
      setNotice(error instanceof ApiError ? error.message : 'Surface entity failed');
    },
  });

  const addFieldMutation = useMutation({
    mutationFn: () =>
      api.addOntologyField({ callId, entityKey, fieldKey, label: fieldLabel, fieldType }),
    onSuccess: (data) => {
      setNoticeTone('success');
      setNotice(data.message ?? 'Field added');
      setSurfaceResult(null);
      void invalidateWorkspace();
    },
    onError: (error) => {
      setNoticeTone('error');
      setNotice(error instanceof ApiError ? error.message : 'Add field failed');
    },
  });

  const previewMutation = useMutation({
    mutationFn: (moduleId: string) => api.composeModule(moduleId),
    onSuccess: setPreview,
    onError: (error) => {
      setNoticeTone('error');
      setNotice(error instanceof ApiError ? error.message : 'Preview failed');
    },
  });

  const workspace = workspaceQuery.data;
  const calls = workspace?.calls ?? [];
  const ontology = workspace?.ontology ?? null;
  const strategies = workspace?.strategies ?? [];
  const modules = workspace?.modules ?? [];
  const demoEntities = workspace?.demoEntities ?? [];
  const surfacingId =
    surfaceModuleMutation.isPending
      ? surfaceModuleMutation.variables ?? null
      : surfaceEntityMutation.isPending
        ? surfaceEntityMutation.variables ?? null
        : null;

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
          Configure ontology and workflow modules — changes push to Operator Console via WebSocket
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

        {workspaceQuery.isPending ? (
          <div style={{ marginTop: 16, color: 'var(--hcaf-text-muted)' }}>Loading workspace…</div>
        ) : workspaceQuery.isError ? (
          <div style={{ marginTop: 16, color: 'var(--hcaf-danger)' }}>Failed to load config workspace.</div>
        ) : (
          <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
            <Card title="How schema extension works">
              <ol style={{ fontSize: 13, color: 'var(--hcaf-text-muted)', paddingLeft: 20, display: 'grid', gap: 8 }}>
                <li><strong>Surface a module</strong> — composes UI from layout advisor and pushes <code>workflow.schema</code> to the call.</li>
                <li><strong>Add ontology field</strong> — extends the entity catalog; active panels re-compose when applicable.</li>
                <li><strong>Operator Console</strong> — renders from schema; new component <code>type</code>s need a registry entry.</li>
              </ol>
            </Card>

            <Card title="Demo entity catalog" actions={<Badge variant="success">{demoEntities.length} entities</Badge>}>
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
                        onClick={() => surfaceEntityMutation.mutate(e.id)}
                        disabled={surfaceModuleMutation.isPending || surfaceEntityMutation.isPending}
                      >
                        {surfacingId === e.id ? 'Surfacing…' : 'Surface new entity'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Workflow modules" actions={<Badge variant="default">{modules.length} available</Badge>}>
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
                        <Button variant="ghost" onClick={() => previewMutation.mutate(m.id)}>Preview</Button>
                        <Button
                          onClick={() => surfaceModuleMutation.mutate(m.id)}
                          disabled={surfaceModuleMutation.isPending || surfaceEntityMutation.isPending}
                        >
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
              <Button onClick={() => addFieldMutation.mutate()} disabled={addFieldMutation.isPending}>
                {addFieldMutation.isPending ? 'Adding…' : 'Add field & push to call'}
              </Button>
            </Card>

            <Card title="Ontology registry (live)">
              {entityRows.length > 0 ? (
                <DataTable rows={entityRows} columns={['entity', 'field', 'type', 'label']} />
              ) : (
                <div style={{ color: 'var(--hcaf-text-muted)', fontSize: 13 }}>No entities loaded</div>
              )}
            </Card>

            <Card title="Layout strategies">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {strategies.map((s) => <Badge key={s} variant="info">{s}</Badge>)}
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
