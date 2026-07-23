import { createElement, useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Field,
  Grid,
  Panel,
  ProgressBar,
  SplitGrid,
  Stack,
  StatCard,
  Timeline,
  statusBadgeVariant,
} from '@hcaf/ui';
import type { AgentRecommendation, CallState, ComponentRegistry, RegistryComponentProps, UISchemaNode } from './session.js';
import { resolveBind } from './session.js';

function PatientHeader({ node, data }: RegistryComponentProps) {
  const patient = (resolveBind(data, node.bind ?? 'patient') ?? data.patient) as Record<string, unknown>;
  return (
    <Card title="Patient">
      <Grid columns={4}>
        <Field label="Name" value={patient.name} />
        <Field label="Member ID" value={patient.memberId} />
        <Field label="DOB" value={patient.dob} />
        <Field label="Phone" value={patient.phone} />
      </Grid>
    </Card>
  );
}

function ProviderCard({ node, data }: RegistryComponentProps) {
  const provider = (resolveBind(data, node.bind ?? 'provider') ?? data.provider) as Record<string, unknown>;
  return (
    <Card title="Provider">
      <Grid columns={3}>
        <Field label="Name" value={provider.name} />
        <Field label="Specialty" value={provider.specialty} />
        <Field label="NPI" value={provider.npi} />
      </Grid>
    </Card>
  );
}

function EligibilityTable({ node, data }: RegistryComponentProps) {
  const rows = (resolveBind(data, node.bind ?? 'eligibility.rows') ?? []) as Array<Record<string, unknown>>;
  const columns = (node.props?.columns as string[]) ?? ['payer', 'status', 'copay'];
  return (
    <Card title="Eligibility">
      <DataTable rows={rows} columns={columns} />
    </Card>
  );
}

function AgentRecommendationPanel({ node, data, onAction }: RegistryComponentProps) {
  const rec = (resolveBind(data, node.bind ?? 'agent.latest') ?? data.agent.latest) as AgentRecommendation;
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const statusVariant =
    rec.status === 'approved' ? 'success'
    : rec.status === 'overridden' ? 'warning'
    : rec.status === 'executing' ? 'info'
    : 'info';
  const statusLabel =
    rec.status === 'executing' ? 'executing…'
    : rec.status === 'approved' ? 'approved'
    : rec.status === 'overridden' ? 'overridden'
    : rec.status === 'pending' ? 'pending'
    : 'monitoring';
  const canSubmitOverride = feedback.trim().length >= 3;

  useEffect(() => {
    if (rec.status !== 'pending') {
      setOverrideOpen(false);
      setFeedback('');
    }
  }, [rec.status]);

  const submitOverride = () => {
    if (!canSubmitOverride) return;
    onAction?.('override', { feedback: feedback.trim() });
    setOverrideOpen(false);
    setFeedback('');
  };

  return (
    <Card
      title="Agent Recommendation"
      actions={<Badge variant={statusVariant}>{statusLabel}</Badge>}
    >
      <Stack gap={8}>
        <div style={{ fontSize: 13 }}>{rec.text}</div>
        <div style={{ fontSize: 11, color: 'var(--hcaf-text-muted)' }}>
          Confidence: {Math.round(rec.confidence * 100)}% · Action: {rec.action}
        </div>
        {rec.status === 'pending' && !overrideOpen && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => onAction?.('approve')}>Approve</Button>
            <Button variant="ghost" onClick={() => setOverrideOpen(true)}>Override</Button>
          </div>
        )}
        {rec.status === 'pending' && overrideOpen && (
          <Stack gap={8}>
            <div style={{ fontSize: 11, color: 'var(--hcaf-text-muted)' }}>
              Explain why you are overriding the agent recommendation. This is sent to the server and logged on the call.
            </div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. Patient already has auth on file from last visit"
              rows={3}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 'var(--hcaf-radius)',
                border: '1px solid var(--hcaf-border)',
                background: 'var(--hcaf-surface-elevated)',
                color: 'var(--hcaf-text)',
                fontSize: 12,
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={submitOverride} disabled={!canSubmitOverride}>Submit override</Button>
              <Button variant="ghost" onClick={() => { setOverrideOpen(false); setFeedback(''); }}>Cancel</Button>
            </div>
          </Stack>
        )}
        {rec.status === 'executing' && (
          <div style={{ fontSize: 12, color: 'var(--hcaf-text-muted)' }}>Applying recommendation to call state…</div>
        )}
        {(rec.status === 'approved' || rec.status === 'overridden') && (
          <div style={{ fontSize: 12, color: 'var(--hcaf-text-muted)' }}>
            {rec.status === 'approved'
              ? 'Action completed — entity and workflow panel updated from server.'
              : rec.outcome ?? 'Override recorded — server state updated.'}
          </div>
        )}
      </Stack>
    </Card>
  );
}

function WorkflowCard({ node, data, onAction, registry }: RegistryComponentProps) {
  const statusBind = node.props?.statusBind as string | undefined;
  const status = statusBind ? resolveBind(data, statusBind) : undefined;
  const variant = node.props?.statusVariant as string | undefined;
  return (
    <Card
      title={(node.props?.title as string) ?? node.type}
      actions={status !== undefined ? <Badge variant={variant ? (variant as 'warning') : statusBadgeVariant(status)}>{String(status)}</Badge> : undefined}
    >
      <Stack gap={12}>
        {node.children?.map((child, i) => (
          <SurfaceNode key={i} node={child} data={data} onAction={onAction} registry={registry} />
        ))}
      </Stack>
    </Card>
  );
}

function AlertBlock({ node, data }: RegistryComponentProps) {
  const message =
    (node.props?.message as string) ??
    (node.props?.messageBind ? String(resolveBind(data, node.props.messageBind as string) ?? '') : '');
  const variant = (node.props?.variant as 'info' | 'warning' | 'danger' | 'success') ?? 'info';
  const title = node.props?.title as string | undefined;
  return <Alert variant={variant} title={title}>{message}</Alert>;
}

function ProgressPanel({ node, data }: RegistryComponentProps) {
  const bind = node.bind ?? '';
  const obj = (resolveBind(data, bind) ?? {}) as Record<string, number>;
  const items = (node.props?.items as Array<{ key: string; label: string; maxKey: string; format?: 'percent' | 'currency' }>) ?? [];
  return (
    <Stack gap={10}>
      {items.map((item) => (
        <ProgressBar
          key={item.key}
          label={item.label}
          value={obj[item.key] ?? 0}
          max={obj[item.maxKey] ?? 1}
          format={item.format}
        />
      ))}
    </Stack>
  );
}

function StatGrid({ node, data }: RegistryComponentProps) {
  const bind = node.bind ?? '';
  const obj = (resolveBind(data, bind) ?? {}) as Record<string, unknown>;
  const metrics = (node.props?.metrics as Array<{ key: string; label: string; format?: string; variant?: 'default' | 'success' | 'warning' | 'danger' }>) ?? [];
  return (
    <Grid columns={(node.props?.columns as number) ?? metrics.length}>
      {metrics.map((m) => {
        const raw = obj[m.key];
        const value =
          m.format === 'currency' && typeof raw === 'number'
            ? `$${raw.toLocaleString()}`
            : m.format === 'boolean'
              ? raw ? 'Yes' : 'No'
              : String(raw ?? '—');
        return <StatCard key={m.key} label={m.label} value={value} variant={m.variant} />;
      })}
    </Grid>
  );
}

function BoundDataTable({ node, data }: RegistryComponentProps) {
  const rows = (resolveBind(data, node.bind ?? '') ?? []) as Array<Record<string, unknown>>;
  const columns = (node.props?.columns as string[]) ?? [];
  return <DataTable rows={rows} columns={columns} />;
}

function TimelinePanel({ node, data }: RegistryComponentProps) {
  const items = (resolveBind(data, node.bind ?? '') ?? []) as Array<{ time: string; title: string; detail?: string; status?: string }>;
  return <Timeline items={items} />;
}

function SplitLayout({ node, data, onAction, registry }: RegistryComponentProps) {
  const children = node.children ?? [];
  const ratio = (node.props?.ratio as string) ?? '1fr 1fr';
  return (
    <SplitGrid
      ratio={ratio}
      left={children[0] ? <SurfaceNode node={children[0]} data={data} onAction={onAction} registry={registry} /> : null}
      right={children[1] ? <SurfaceNode node={children[1]} data={data} onAction={onAction} registry={registry} /> : null}
    />
  );
}

function CobFlow({ node, data }: RegistryComponentProps) {
  const cob = (resolveBind(data, node.bind ?? 'cob') ?? {}) as Record<string, unknown>;
  return (
    <Stack gap={10}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
        <div style={{ textAlign: 'center', padding: 12, border: '1px solid var(--hcaf-border)', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--hcaf-text-muted)' }}>Primary</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{String(cob.primaryPayer ?? '—')}</div>
        </div>
        <div style={{ fontSize: 18, color: 'var(--hcaf-text-muted)' }}>→</div>
        <div style={{ textAlign: 'center', padding: 12, border: '1px solid var(--hcaf-border)', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--hcaf-text-muted)' }}>Secondary</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{String(cob.secondaryPayer ?? '—')}</div>
        </div>
      </div>
      <Alert variant="info" title="COB Rule">{String(cob.rule ?? '')}</Alert>
    </Stack>
  );
}

function GenericField({ node, data }: RegistryComponentProps) {
  const bind = node.bind ?? '';
  const value = resolveBind(data, bind);
  const label = (node.props?.label as string) ?? bind.split('.').pop() ?? 'Field';
  const type = (node.props?.fieldType as string) ?? 'string';
  return <Field label={label} value={value} type={type} />;
}

function GenericPanel({ node, data, onAction, registry }: RegistryComponentProps) {
  return (
    <Panel title={(node.props?.title as string) ?? node.type}>
      <Stack gap={8}>
        {node.children?.map((child, i) => (
          <SurfaceNode key={i} node={child} data={data} onAction={onAction} registry={registry} />
        ))}
      </Stack>
    </Panel>
  );
}

function StackLayout({ node, data, onAction, registry }: RegistryComponentProps) {
  return (
    <Stack gap={(node.props?.gap as number) ?? 12}>
      {node.children?.map((child, i) => (
        <SurfaceNode key={i} node={child} data={data} onAction={onAction} registry={registry} />
      ))}
    </Stack>
  );
}

function GridLayout({ node, data, onAction, registry }: RegistryComponentProps) {
  return (
    <Grid columns={(node.props?.columns as number) ?? 2}>
      {node.children?.map((child, i) => (
        <SurfaceNode key={i} node={child} data={data} onAction={onAction} registry={registry} />
      ))}
    </Grid>
  );
}

function UnknownComponent({ node }: RegistryComponentProps) {
  return (
    <div style={{ color: 'var(--hcaf-warning)', fontSize: 11 }}>Unknown: {node.type}</div>
  );
}

export function SurfaceNode({
  node,
  data,
  onAction,
  registry,
}: RegistryComponentProps) {
  const Component = registry[node.type] ?? registry.Unknown;
  return createElement(Component, { node, data, onAction, registry });
}

export const defaultRegistry: ComponentRegistry = {
  Stack: StackLayout,
  Grid: GridLayout,
  Split: SplitLayout,
  Panel: GenericPanel,
  Field: GenericField,
  WorkflowCard,
  Alert: AlertBlock,
  ProgressPanel,
  StatGrid,
  DataTable: BoundDataTable,
  Timeline: TimelinePanel,
  CobFlow,
  PatientHeader,
  ProviderCard,
  EligibilityTable,
  AgentRecommendation: AgentRecommendationPanel,
  Unknown: UnknownComponent,
};

export function SurfaceRenderer({
  schema,
  data,
  onAction,
  registry = defaultRegistry,
}: {
  schema: { root: UISchemaNode };
  data: CallState;
  onAction?: (action: string, payload?: unknown) => void;
  registry?: ComponentRegistry;
}): ReactNode {
  return <SurfaceNode node={schema.root} data={data} onAction={onAction} registry={registry} />;
}

export * from './session.js';
