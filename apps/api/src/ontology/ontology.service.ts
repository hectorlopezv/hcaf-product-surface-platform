import { Injectable } from '@nestjs/common';
import { DEFAULT_ONTOLOGY, type EntityDefinition, type OntologyDefinition } from '@hcaf/ontology';
import type { WorkflowStepDef } from '../workflows/eligibility-workflow';
import { inferFieldsFromData } from '../schema/schema-composer';

function entityFromStep(step: WorkflowStepDef): EntityDefinition {
  const entityData = (step.state[step.entityKey] ?? {}) as Record<string, unknown>;
  const inferred = inferFieldsFromData(step.entityKey, entityData);
  const merged = [...step.fields];
  for (const f of inferred) {
    if (!merged.some((m) => m.bind === f.bind)) merged.push(f);
  }

  const fieldDefs: EntityDefinition['fields'] = {};
  for (const f of merged) {
    const key = f.bind.split('.')[1];
    if (!key) continue;
    const type = (f.fieldType ?? 'string') as 'string' | 'number' | 'date' | 'currency' | 'enum' | 'boolean';
    fieldDefs[key] = { type, label: f.label };
  }
  return { label: step.title, fields: fieldDefs };
}

interface CallOntology {
  entities: OntologyDefinition['entities'];
  applied: Set<string>;
  revision: number;
}

@Injectable()
export class OntologyService {
  private byCall = new Map<string, CallOntology>();

  private ensure(callId: string): CallOntology {
    if (!this.byCall.has(callId)) {
      this.byCall.set(callId, { entities: { ...DEFAULT_ONTOLOGY.entities }, applied: new Set(), revision: 0 });
    }
    return this.byCall.get(callId)!;
  }

  getOntology(callId: string): OntologyDefinition {
    const o = this.ensure(callId);
    return { version: `1.0.${o.revision}`, entities: { ...o.entities } };
  }

  extendWithStep(callId: string, step: WorkflowStepDef): { ontology: OntologyDefinition; label: string; isNew: boolean } {
    const o = this.ensure(callId);
    const isNew = !o.applied.has(step.entityKey);
    if (isNew) {
      o.applied.add(step.entityKey);
      o.entities = { ...o.entities, [step.entityKey]: entityFromStep(step) };
      o.revision += 1;
    }
    return { ontology: { version: `1.0.${o.revision}`, entities: { ...o.entities } }, label: step.title, isNew };
  }

  reset(callId: string): OntologyDefinition {
    this.byCall.set(callId, { entities: { ...DEFAULT_ONTOLOGY.entities }, applied: new Set(), revision: 0 });
    return this.getOntology(callId);
  }

  addField(
    callId: string,
    entityKey: string,
    fieldKey: string,
    field: { type: string; label: string },
  ): { ontology: OntologyDefinition; isNewEntity: boolean } {
    const o = this.ensure(callId);
    const existing = o.entities[entityKey];
    const isNewEntity = !existing;

    o.entities = {
      ...o.entities,
      [entityKey]: {
        label: existing?.label ?? entityKey.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
        fields: {
          ...(existing?.fields ?? {}),
          [fieldKey]: { type: field.type as 'string', label: field.label },
        },
      },
    };
    o.revision += 1;

    return { ontology: this.getOntology(callId), isNewEntity };
  }
}
