export type { FieldType, FieldDefinition, EntityDefinition, OntologyDefinition } from './types.js';

export function getByPath(data: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, data);
}

export function resolveFieldMeta(
  ontology: import('./types.js').OntologyDefinition,
  bindPath: string,
): import('./types.js').FieldDefinition | undefined {
  const [entityKey, fieldKey] = bindPath.split('.');
  return ontology.entities[entityKey]?.fields[fieldKey];
}

export function validateBindPath(
  ontology: import('./types.js').OntologyDefinition,
  bindPath: string,
): boolean {
  const parts = bindPath.split('.');
  if (parts.length < 2) return false;
  const [entityKey, fieldKey] = parts;
  return Boolean(ontology.entities[entityKey]?.fields[fieldKey]);
}

export { DEFAULT_ONTOLOGY, PRIOR_AUTH_ONTOLOGY_EXTENSION } from './default-ontology.js';
export * from './scenarios.js';
