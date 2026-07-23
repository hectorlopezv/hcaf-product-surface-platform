export type FieldType = 'string' | 'number' | 'date' | 'currency' | 'enum' | 'boolean';

export interface FieldDefinition {
  type: FieldType;
  label: string;
  values?: string[];
}

export interface EntityDefinition {
  label: string;
  fields: Record<string, FieldDefinition>;
}

export interface OntologyDefinition {
  version: string;
  entities: Record<string, EntityDefinition>;
}
