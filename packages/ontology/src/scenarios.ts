import { DEFAULT_ONTOLOGY } from './default-ontology.js';
import type { OntologyDefinition } from './types.js';

export const REFERRAL_ONTOLOGY: OntologyDefinition = {
  version: '1.2.0',
  entities: {
    ...DEFAULT_ONTOLOGY.entities,
    priorAuth: {
      label: 'Prior Authorization',
      fields: {
        required: { type: 'boolean', label: 'Prior Auth Required' },
        reason: { type: 'string', label: 'Reason' },
        status: { type: 'enum', label: 'Status', values: ['not_started', 'submitted', 'approved', 'denied'] },
      },
    },
    referral: {
      label: 'Specialist Referral',
      fields: {
        required: { type: 'boolean', label: 'Referral Required' },
        specialist: { type: 'string', label: 'Specialist' },
        expiresOn: { type: 'date', label: 'Expires On' },
        status: { type: 'enum', label: 'Status', values: ['missing', 'on_file', 'expired'] },
      },
    },
  },
};

export const COB_ONTOLOGY: OntologyDefinition = {
  version: '1.3.0',
  entities: {
    ...REFERRAL_ONTOLOGY.entities,
    cob: {
      label: 'Coordination of Benefits',
      fields: {
        primaryPayer: { type: 'string', label: 'Primary Payer' },
        secondaryPayer: { type: 'string', label: 'Secondary Payer' },
        rule: { type: 'string', label: 'COB Rule' },
      },
    },
  },
};
