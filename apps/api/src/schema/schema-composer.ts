import type { UISchemaNode } from '../types';
import type { WorkflowField } from '../workflows/eligibility-workflow';

export type LayoutStrategy =
  | 'cob-flow'
  | 'progress-dashboard'
  | 'tabular-with-summary'
  | 'timeline-schedule'
  | 'escalation-split'
  | 'alert-split'
  | 'field-grid';

export interface ComposeEntityInput {
  entityKey: string;
  title: string;
  panelId: string;
  fields: WorkflowField[];
  entityData: Record<string, unknown>;
}

export interface ComposeResult {
  schemaNode: UISchemaNode;
  layoutStrategy: LayoutStrategy;
  reasoning: string[];
}

const PROGRESS_PAIRS = [
  { key: 'met', maxKey: 'annual', label: 'Annual deductible' },
  { key: 'oopMet', maxKey: 'oopMax', label: 'Out-of-pocket max' },
] as const;

const ALERT_KEYS = ['alert', 'reason', 'riskNote', 'stepTherapyNote', 'outstandingNote', 'denialReason'] as const;
const STATUS_KEYS = [
  'status', 'overallStatus', 'level', 'order', 'urgency',
  'stepTherapyStatus', 'remainingLabel', 'balanceBilling',
] as const;

function fieldLabel(fields: WorkflowField[], entityKey: string, key: string): string {
  return fields.find((f) => f.bind === `${entityKey}.${key}`)?.label ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

function fieldType(fields: WorkflowField[], entityKey: string, key: string): string {
  return fields.find((f) => f.bind === `${entityKey}.${key}`)?.fieldType ?? inferType(key);
}

function inferType(key: string): string {
  if (key.includes('copay') || key.includes('Amount') || key.includes('remaining') || key === 'annual' || key === 'met') return 'currency';
  if (key.startsWith('is') || key.includes('Required') || key === 'inNetwork' || key === 'mailOrder' || key === 'telehealth') return 'boolean';
  if (key.includes('On') || key.includes('Slot') || key.includes('date')) return 'date';
  return 'string';
}

function findStatusBind(entityKey: string, data: Record<string, unknown>): string | undefined {
  for (const k of STATUS_KEYS) {
    if (data[k] != null && data[k] !== '') return `${entityKey}.${k}`;
  }
  if (data.summary && typeof data.summary === 'object') {
    const s = data.summary as Record<string, unknown>;
    if (s.status != null) return `${entityKey}.summary.status`;
  }
  return undefined;
}

function findAlertBind(entityKey: string, data: Record<string, unknown>): string | undefined {
  for (const k of ALERT_KEYS) {
    if (typeof data[k] === 'string' && (data[k] as string).length > 10) return `${entityKey}.${k}`;
  }
  if (data.summary && typeof data.summary === 'object') {
    const s = data.summary as Record<string, unknown>;
    if (typeof s.denialReason === 'string') return `${entityKey}.summary.denialReason`;
  }
  return undefined;
}

function alertVariant(bind: string): 'info' | 'warning' | 'danger' | 'success' {
  if (bind.includes('denial') || bind.includes('risk') || bind.includes('escalation')) return 'danger';
  if (bind.includes('alert') || bind.includes('outstanding') || bind.includes('stepTherapy')) return 'warning';
  return 'info';
}

function statVariant(key: string, value: unknown): 'default' | 'success' | 'warning' | 'danger' | undefined {
  if (key.includes('Denied') || key === 'priority') return 'danger';
  if (key.includes('Paid') || key === 'inNetwork') return 'success';
  if (key.includes('remaining') || key === 'sla') return 'warning';
  if (typeof value === 'boolean') return value ? 'success' : 'warning';
  return undefined;
}

function buildFieldGrid(entityKey: string, keys: string[], fields: WorkflowField[], columns = 2): UISchemaNode {
  return {
    type: 'Grid',
    props: { columns },
    children: keys.map((key) => ({
      type: 'Field',
      bind: `${entityKey}.${key}`,
      props: { label: fieldLabel(fields, entityKey, key), fieldType: fieldType(fields, entityKey, key) },
    })),
  };
}

function buildStatGrid(bind: string, keys: string[], data: Record<string, unknown>, fields: WorkflowField[], entityKey: string, columns: number): UISchemaNode {
  return {
    type: 'StatGrid',
    bind,
    props: {
      columns,
      metrics: keys.map((key) => ({
        key,
        label: fieldLabel(fields, entityKey, key),
        format: fieldType(fields, entityKey, key) === 'currency' ? 'currency' : fieldType(fields, entityKey, key) === 'boolean' ? 'boolean' : undefined,
        variant: statVariant(key, data[key]),
      })),
    },
  };
}

export function adviseLayout(input: ComposeEntityInput): { strategy: LayoutStrategy; reasoning: string[] } {
  const { entityKey, entityData } = input;
  const reasoning: string[] = [];

  if (entityData.primaryPayer && entityData.secondaryPayer) {
    reasoning.push('Detected primaryPayer + secondaryPayer → CobFlow visualization');
    return { strategy: 'cob-flow', reasoning };
  }

  const progress = PROGRESS_PAIRS.filter((p) => entityData[p.key] != null && entityData[p.maxKey] != null);
  if (progress.length > 0) {
    reasoning.push(`Detected progress pairs (${progress.map((p) => p.key).join(', ')}) → ProgressPanel`);
    return { strategy: 'progress-dashboard', reasoning };
  }

  if (Array.isArray(entityData.slots) && entityData.slots.length > 0) {
    reasoning.push('Detected slots[] timeline → Timeline + field grid');
    return { strategy: 'timeline-schedule', reasoning };
  }

  if (Array.isArray(entityData.history) && entityData.history.length > 0) {
    reasoning.push('Detected history[] timeline + escalation fields → split layout');
    return { strategy: 'escalation-split', reasoning };
  }

  if (Array.isArray(entityData.rows) || Array.isArray(entityData.documents)) {
    reasoning.push('Detected tabular array → DataTable with summary stats');
    return { strategy: 'tabular-with-summary', reasoning };
  }

  const alertBind = findAlertBind(entityKey, entityData);
  if (alertBind) {
    reasoning.push(`Detected narrative field → Alert (${alertBind}) with split stats`);
    return { strategy: 'alert-split', reasoning };
  }

  reasoning.push('Default → scalar field grid from ontology + data keys');
  return { strategy: 'field-grid', reasoning };
}

export function composeEntityPanel(input: ComposeEntityInput): ComposeResult {
  const { entityKey, title, panelId, fields, entityData } = input;
  const prefix = entityKey;
  const { strategy, reasoning } = adviseLayout(input);
  const statusBind = findStatusBind(prefix, entityData);
  const usedKeys = new Set<string>();

  const cardProps: Record<string, unknown> = { title, panelId, composed: true, layoutStrategy: strategy };
  if (statusBind) cardProps.statusBind = statusBind;
  if (strategy === 'escalation-split') cardProps.statusVariant = 'danger';

  const children: UISchemaNode[] = [];

  if (strategy === 'cob-flow') {
    children.push({ type: 'CobFlow', bind: prefix });
    reasoning.push('Composed CobFlow — no hand-authored template');
    return wrapCard(cardProps, children, strategy, reasoning);
  }

  if (strategy === 'progress-dashboard') {
    const pairs = PROGRESS_PAIRS.filter((p) => entityData[p.key] != null && entityData[p.maxKey] != null);
    pairs.forEach((p) => { usedKeys.add(p.key); usedKeys.add(p.maxKey); });
    children.push({
      type: 'ProgressPanel',
      bind: prefix,
      props: {
        items: pairs.map((p) => ({ key: p.key, label: p.label, maxKey: p.maxKey, format: 'currency' })),
      },
    });
    const statKeys = ['remaining', 'oopRemaining', 'planYear'].filter((k) => entityData[k] != null);
    statKeys.forEach((k) => usedKeys.add(k));
    if (statKeys.length) {
      children.push(buildStatGrid(prefix, statKeys, entityData, fields, entityKey, Math.min(3, statKeys.length)));
    }
    return wrapCard(cardProps, children, strategy, reasoning);
  }

  if (strategy === 'timeline-schedule') {
    usedKeys.add('slots');
    children.push({ type: 'Timeline', bind: `${prefix}.slots` });
    const gridKeys = ['location', 'visitType', 'telehealth', 'earliestSlot'].filter((k) => entityData[k] != null && !usedKeys.has(k));
    gridKeys.forEach((k) => usedKeys.add(k));
    if (gridKeys.length) children.push(buildFieldGrid(prefix, gridKeys, fields, 3));
    return wrapCard(cardProps, children, strategy, reasoning);
  }

  if (strategy === 'escalation-split') {
    const alertBind = findAlertBind(prefix, entityData);
    if (alertBind) {
      children.push({ type: 'Alert', props: { variant: 'danger', title: 'Supervisor review required', messageBind: alertBind } });
      usedKeys.add('reason');
    }
    usedKeys.add('history');
    const statKeys = ['assignedTo', 'sla', 'priority', 'caseId'].filter((k) => entityData[k] != null);
    statKeys.forEach((k) => usedKeys.add(k));
    children.push({
      type: 'Split',
      props: { ratio: '1fr 1fr' },
      children: [
        buildStatGrid(prefix, statKeys, entityData, fields, entityKey, 2),
        { type: 'Timeline', bind: `${prefix}.history` },
      ],
    });
    return wrapCard(cardProps, children, strategy, reasoning);
  }

  if (strategy === 'tabular-with-summary') {
    const arrayKey = Array.isArray(entityData.rows) ? 'rows' : 'documents';
    usedKeys.add(arrayKey);
    if (entityData.summary && typeof entityData.summary === 'object') {
      const summary = entityData.summary as Record<string, unknown>;
      const statKeys = Object.keys(summary).filter((k) => k !== 'denialReason' && k !== 'status');
      statKeys.forEach((k) => usedKeys.add(`summary.${k}`));
      children.push(buildStatGrid(`${prefix}.summary`, statKeys, summary, fields, entityKey, Math.min(3, statKeys.length)));
      const denial = findAlertBind(prefix, entityData);
      if (denial) {
        children.push({ type: 'Alert', props: { variant: 'danger', title: 'Denial reason', messageBind: denial } });
      }
    }
    const rows = entityData[arrayKey] as Record<string, unknown>[];
    const columns = rows[0] ? Object.keys(rows[0]) : [];
    children.push({ type: 'DataTable', bind: `${prefix}.${arrayKey}`, props: { columns } });
    return wrapCard(cardProps, children, strategy, reasoning);
  }

  if (strategy === 'alert-split') {
    const alertBind = findAlertBind(prefix, entityData);
    const alertKey = alertBind?.split('.').pop();
    if (alertKey) usedKeys.add(alertKey);

    const statKeys = Object.keys(entityData).filter((k) => {
      if (usedKeys.has(k) || Array.isArray(entityData[k])) return false;
      const v = entityData[k];
      return typeof v === 'number' || typeof v === 'boolean';
    });
    statKeys.forEach((k) => usedKeys.add(k));

    const fieldKeys = Object.keys(entityData).filter((k) => !usedKeys.has(k) && typeof entityData[k] !== 'object');

    children.push({
      type: 'Split',
      props: { ratio: '1fr 1fr' },
      children: [
        statKeys.length ? buildStatGrid(prefix, statKeys, entityData, fields, entityKey, 2) : buildFieldGrid(prefix, fieldKeys.slice(0, 4), fields, 2),
        { type: 'Alert', props: { variant: alertVariant(alertBind ?? ''), title: 'Review required', messageBind: alertBind } },
      ],
    });
    return wrapCard(cardProps, children, strategy, reasoning);
  }

  // field-grid fallback — works for ANY entity: one Field per scalar key
  const scalarKeys = Object.keys(entityData).filter((k) => {
    const v = entityData[k];
    return v != null && typeof v !== 'object';
  });
  const alertBind = findAlertBind(prefix, entityData);
  if (alertBind) {
    const alertKey = alertBind.split('.').pop()!;
    children.push({ type: 'Alert', props: { variant: alertVariant(alertBind), title: 'Note', messageBind: alertBind } });
    const idx = scalarKeys.indexOf(alertKey);
    if (idx >= 0) scalarKeys.splice(idx, 1);
  }
  const metricKeys = scalarKeys.filter((k) => typeof entityData[k] === 'number' || typeof entityData[k] === 'boolean');
  const textKeys = scalarKeys.filter((k) => !metricKeys.includes(k));

  if (metricKeys.length) children.push(buildStatGrid(prefix, metricKeys, entityData, fields, entityKey, Math.min(3, metricKeys.length)));
  if (textKeys.length) children.push(buildFieldGrid(prefix, textKeys, fields, 2));

  reasoning.push(`Fallback composed ${metricKeys.length} metrics + ${textKeys.length} fields from data shape`);
  return wrapCard(cardProps, children, strategy, reasoning);
}

function wrapCard(
  props: Record<string, unknown>,
  children: UISchemaNode[],
  layoutStrategy: LayoutStrategy,
  reasoning: string[],
): ComposeResult {
  return {
    schemaNode: { type: 'WorkflowCard', props, children },
    layoutStrategy,
    reasoning,
  };
}

/** Infer ontology fields from runtime entity data (scalars only). */
export function inferFieldsFromData(entityKey: string, entityData: Record<string, unknown>): WorkflowField[] {
  const result: WorkflowField[] = [];
  for (const [key, value] of Object.entries(entityData)) {
    if (value != null && typeof value === 'object' && !Array.isArray(value)) continue;
    if (Array.isArray(value)) continue;
    result.push({ bind: `${entityKey}.${key}`, label: fieldLabel([], entityKey, key), fieldType: inferType(key) });
  }
  return result;
}
