import type { OntologyDefinition } from './types.js';

export const DEFAULT_ONTOLOGY: OntologyDefinition = {
  version: '1.0.0',
  entities: {
    patient: {
      label: 'Patient',
      fields: {
        name: { type: 'string', label: 'Patient Name' },
        memberId: { type: 'string', label: 'Member ID' },
        dob: { type: 'date', label: 'Date of Birth' },
        phone: { type: 'string', label: 'Phone' },
      },
    },
    provider: {
      label: 'Provider',
      fields: {
        name: { type: 'string', label: 'Provider Name' },
        specialty: { type: 'string', label: 'Specialty' },
        npi: { type: 'string', label: 'NPI' },
      },
    },
    eligibility: {
      label: 'Eligibility',
      fields: {
        payer: { type: 'string', label: 'Payer' },
        status: { type: 'enum', label: 'Status', values: ['active', 'pending', 'denied'] },
        copay: { type: 'currency', label: 'Copay' },
        planTier: { type: 'string', label: 'Plan Tier' },
      },
    },
    agent: {
      label: 'Agent',
      fields: {
        recommendation: { type: 'string', label: 'Recommendation' },
        confidence: { type: 'number', label: 'Confidence' },
        action: { type: 'string', label: 'Suggested Action' },
      },
    },
  },
};

export const PRIOR_AUTH_ONTOLOGY_EXTENSION: OntologyDefinition = {
  version: '1.1.0',
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
  },
};
