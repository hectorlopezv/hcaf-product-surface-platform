import type { AgentRecommendation } from '../types';
import type { LayoutStrategy } from '../schema/schema-composer';
import { inferFieldsFromData } from '../schema/schema-composer';
import type { WorkflowStepDef } from './eligibility-workflow';

export interface DemoEntityCatalogItem {
  id: string;
  title: string;
  entityKey: string;
  description: string;
  expectedLayout: LayoutStrategy;
  entityData: Record<string, unknown>;
  agent: AgentRecommendation;
}

export const DEMO_ENTITIES: DemoEntityCatalogItem[] = [
  {
    id: 'entity-transportBenefit',
    title: 'Transport Benefit',
    entityKey: 'transportBenefit',
    description: 'Scalar fields for NEMT benefit limits and authorization.',
    expectedLayout: 'field-grid',
    entityData: {
      ridesRemaining: 4,
      maxMiles: 50,
      requiresAuth: true,
      planName: 'Medicare Advantage Transport',
    },
    agent: {
      text: 'Patient has 4 NEMT rides remaining this plan year. Verify pickup address before scheduling.',
      confidence: 0.91,
      action: 'Book medical transport',
    },
  },
  {
    id: 'entity-careGap',
    title: 'Care Gap Closure',
    entityKey: 'careGap',
    description: 'Summary stats plus tabular rows of open care gaps.',
    expectedLayout: 'tabular-with-summary',
    entityData: {
      summary: {
        status: 'open',
        totalOpen: 3,
        highPriority: 1,
        lastClosedOn: '2026-04-12',
      },
      rows: [
        { gap: 'Annual wellness visit', dueDate: '2026-08-01', status: 'overdue', priority: 'high' },
        { gap: 'HbA1c screening', dueDate: '2026-09-15', status: 'due_soon', priority: 'medium' },
        { gap: 'Breast cancer screening', dueDate: '2026-11-30', status: 'scheduled', priority: 'low' },
      ],
    },
    agent: {
      text: '3 open care gaps on file — annual wellness is overdue. Offer scheduling during this call.',
      confidence: 0.89,
      action: 'Schedule gap closure visit',
    },
  },
  {
    id: 'entity-vaccineSchedule',
    title: 'Vaccine Scheduling',
    entityKey: 'vaccineSchedule',
    description: 'Timeline slots for immunization appointments.',
    expectedLayout: 'timeline-schedule',
    entityData: {
      vaccine: 'Shingrix (2-dose series)',
      doseNumber: 2,
      slots: [
        { time: 'Mon 9:00 AM', title: 'Pharmacy — Main St', detail: 'Walk-in available', status: 'available' },
        { time: 'Wed 2:30 PM', title: 'PCP Office', detail: 'Nurse visit required', status: 'available' },
        { time: 'Fri 11:00 AM', title: 'Community Clinic', detail: 'Insurance pre-verified', status: 'recommended' },
      ],
    },
    agent: {
      text: 'Shingrix dose 2 due. Three appointment slots available — recommend Friday clinic (pre-verified).',
      confidence: 0.93,
      action: 'Book vaccine appointment',
    },
  },
];

export function getDemoEntity(id: string): DemoEntityCatalogItem | undefined {
  return DEMO_ENTITIES.find((e) => e.id === id);
}

export function listDemoEntities() {
  return DEMO_ENTITIES.map((e) => ({
    id: e.id,
    title: e.title,
    entityKey: e.entityKey,
    description: e.description,
    expectedLayout: e.expectedLayout,
    fieldCount: Object.keys(e.entityData).length,
  }));
}

export function demoEntityToStep(def: DemoEntityCatalogItem): WorkflowStepDef {
  return {
    id: def.id,
    title: def.title,
    entityKey: def.entityKey,
    fields: inferFieldsFromData(def.entityKey, def.entityData),
    state: { [def.entityKey]: def.entityData },
    agent: def.agent,
  };
}
