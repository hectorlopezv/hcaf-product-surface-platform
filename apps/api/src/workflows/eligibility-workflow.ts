import type { AgentRecommendation } from '../types';

export interface WorkflowField {
  bind: string;
  label: string;
  fieldType?: string;
}

/** Workflow module = ontology + data only. UI schema is composed at runtime. */
export interface WorkflowStepDef {
  id: string;
  title: string;
  entityKey: string;
  fields: WorkflowField[];
  state: Record<string, unknown>;
  agent: AgentRecommendation;
}

export const ELIGIBILITY_WORKFLOW_ID = 'eligibility-check';

export const ELIGIBILITY_WORKFLOW_STEPS: WorkflowStepDef[] = [
  {
    id: 'priorAuth',
    title: 'Prior Authorization',
    entityKey: 'priorAuth',
    fields: [
      { bind: 'priorAuth.required', label: 'Required', fieldType: 'boolean' },
      { bind: 'priorAuth.status', label: 'Status' },
      { bind: 'priorAuth.reason', label: 'Reason' },
    ],
    state: {
      priorAuth: {
        required: true, status: 'not_started', reason: 'Specialist visit requires payer pre-authorization',
        authNumber: '—', expiresOn: '—', procedure: 'CPT 93306 — Echocardiogram', payerPortal: 'Aetna Precert',
      },
    },
    agent: { text: 'Prior authorization required. Submit PA request via payer portal before scheduling.', confidence: 0.94, action: 'Submit prior auth request', status: 'pending' },
  },
  {
    id: 'referral',
    title: 'Specialist Referral',
    entityKey: 'referral',
    fields: [
      { bind: 'referral.required', label: 'Referral Required', fieldType: 'boolean' },
      { bind: 'referral.status', label: 'Status' },
      { bind: 'referral.specialist', label: 'Specialist' },
    ],
    state: {
      referral: {
        required: true, specialist: 'Dr. James Chen — Cardiology', pcp: 'Dr. Torres', expiresOn: '2026-09-15',
        status: 'missing', visitsRemaining: 0, alert: 'No referral on file. Request from PCP before booking.',
      },
    },
    agent: { text: 'No specialist referral on file. Request referral from PCP before booking.', confidence: 0.91, action: 'Request referral from primary care', status: 'pending' },
  },
  {
    id: 'cob',
    title: 'Coordination of Benefits',
    entityKey: 'cob',
    fields: [
      { bind: 'cob.primaryPayer', label: 'Primary Payer' },
      { bind: 'cob.secondaryPayer', label: 'Secondary Payer' },
      { bind: 'cob.rule', label: 'COB Rule' },
    ],
    state: {
      cob: { primaryPayer: 'Aetna', secondaryPayer: 'Medicare Part B', rule: 'Medicare secondary when employer coverage < 20 employees', order: 'Aetna → Medicare' },
    },
    agent: { text: 'Medicare is secondary. Bill Aetna first, then Medicare for remaining balance.', confidence: 0.88, action: 'Apply COB billing order', status: 'pending' },
  },
  {
    id: 'deductible',
    title: 'Deductible & Out-of-Pocket',
    entityKey: 'deductible',
    fields: [
      { bind: 'deductible.annual', label: 'Annual Deductible', fieldType: 'currency' },
      { bind: 'deductible.met', label: 'Amount Met', fieldType: 'currency' },
      { bind: 'deductible.oopMax', label: 'OOP Maximum', fieldType: 'currency' },
    ],
    state: {
      deductible: { annual: 1500, met: 920, oopMax: 6000, oopMet: 2100, remaining: 580, oopRemaining: 3900, remainingLabel: '$580 left', planYear: '2026' },
    },
    agent: { text: 'Patient has $580 remaining on deductible. Inform patient of estimated responsibility.', confidence: 0.89, action: 'Share cost estimate with patient', status: 'pending' },
  },
  {
    id: 'pharmacy',
    title: 'Pharmacy Benefits',
    entityKey: 'pharmacy',
    fields: [
      { bind: 'pharmacy.formulary', label: 'Formulary Tier' },
      { bind: 'pharmacy.priorAuthDrug', label: 'PA Required Drug' },
      { bind: 'pharmacy.copay', label: 'Rx Copay', fieldType: 'currency' },
    ],
    state: {
      pharmacy: {
        formulary: 'Tier 2', priorAuthDrug: 'Eliquis 5mg', copay: 45, mailOrder: true,
        stepTherapyStatus: 'review', stepTherapyNote: 'Eliquis requires completed warfarin trial or documented intolerance.',
      },
    },
    agent: { text: 'Eliquis requires step therapy. Check if patient completed trial of warfarin.', confidence: 0.86, action: 'Verify step therapy history', status: 'pending' },
  },
  {
    id: 'claims',
    title: 'Recent Claims',
    entityKey: 'claims',
    fields: [
      { bind: 'claims.status', label: 'Claim Status' },
      { bind: 'claims.lastAmount', label: 'Last Claim Amount', fieldType: 'currency' },
    ],
    state: {
      claims: {
        summary: { status: 'denied', lastAmount: 1240, totalDenied: 2, totalPaid: 3840, denialReason: 'Missing modifier 25 on E/M visit' },
        rows: [
          { date: '2026-05-14', code: '99214', amount: 1240, status: 'denied' },
          { date: '2026-04-02', code: '93000', amount: 180, status: 'paid' },
          { date: '2026-03-18', code: '80053', amount: 95, status: 'paid' },
        ],
      },
    },
    agent: { text: 'Recent claim denied for missing modifier. Recommend appeal with corrected coding.', confidence: 0.92, action: 'Initiate claim appeal', status: 'pending' },
  },
  {
    id: 'oon',
    title: 'Out-of-Network Review',
    entityKey: 'oon',
    fields: [
      { bind: 'oon.inNetwork', label: 'In Network', fieldType: 'boolean' },
      { bind: 'oon.patientResponsibility', label: 'Patient Responsibility', fieldType: 'currency' },
    ],
    state: {
      oon: {
        inNetwork: false, allowedAmount: 320, billedAmount: 1450, patientResponsibility: 890,
        balanceBilling: 'high', riskNote: 'Provider is OON. Patient may be balance-billed for $890 above allowed amount.',
      },
    },
    agent: { text: 'Provider is out-of-network. Patient may face balance billing — discuss options.', confidence: 0.9, action: 'Offer in-network alternative', status: 'pending' },
  },
  {
    id: 'scheduling',
    title: 'Appointment Scheduling',
    entityKey: 'scheduling',
    fields: [
      { bind: 'scheduling.earliestSlot', label: 'Earliest Slot', fieldType: 'date' },
      { bind: 'scheduling.location', label: 'Location' },
    ],
    state: {
      scheduling: {
        earliestSlot: '2026-08-04', location: 'Main Campus — Bldg C', visitType: 'Follow-up', telehealth: true, urgency: 'routine',
        slots: [
          { time: 'Tomorrow 9:00 AM', title: 'Telehealth — Dr. Chen', detail: '30 min follow-up', status: 'active' },
          { time: 'Aug 4 2:30 PM', title: 'In-person — Bldg C', detail: 'Earliest in-person', status: 'pending' },
          { time: 'Aug 11 10:00 AM', title: 'In-person — Bldg C', detail: 'Alternative slot', status: 'pending' },
        ],
      },
    },
    agent: { text: 'Earliest in-person slot is 12 days out. Telehealth available tomorrow.', confidence: 0.85, action: 'Offer telehealth slot', status: 'pending' },
  },
  {
    id: 'consent',
    title: 'Patient Consent',
    entityKey: 'consent',
    fields: [
      { bind: 'consent.hipaaOnFile', label: 'HIPAA on File', fieldType: 'boolean' },
      { bind: 'consent.overallStatus', label: 'Overall Status' },
    ],
    state: {
      consent: {
        overallStatus: 'incomplete', outstandingNote: 'Financial policy consent for 2026 not signed.',
        documents: [
          { document: 'HIPAA Authorization', status: 'signed', signedOn: '2024-01-10' },
          { document: 'Treatment Consent', status: 'pending', signedOn: '—' },
          { document: 'Financial Policy 2026', status: 'unsigned', signedOn: '—' },
        ],
      },
    },
    agent: { text: 'Financial policy consent missing for 2026. Collect signature before visit.', confidence: 0.93, action: 'Send consent form via patient portal', status: 'pending' },
  },
  {
    id: 'escalation',
    title: 'Case Escalation',
    entityKey: 'escalation',
    fields: [
      { bind: 'escalation.level', label: 'Escalation Level' },
      { bind: 'escalation.reason', label: 'Reason' },
    ],
    state: {
      escalation: {
        level: 'supervisor', reason: 'Multi-payer COB dispute + denied claim require supervisor review.',
        assignedTo: 'Claims Resolution Team', sla: '4 business hours', priority: 'P1', caseId: 'ESC-2026-44821',
        history: [
          { time: '12:04 PM', title: 'Auto-escalated', detail: '3 unresolved blockers detected', status: 'pending' },
          { time: '12:02 PM', title: 'COB conflict flagged', detail: 'Medicare secondary rule mismatch', status: 'pending' },
          { time: '11:58 AM', title: 'Claim denial surfaced', detail: 'Modifier 25 missing', status: 'denied' },
        ],
      },
    },
    agent: { text: 'Complex case — recommend supervisor review. Multiple blockers unresolved.', confidence: 0.96, action: 'Escalate to supervisor queue', status: 'pending' },
  },
];

export function getWorkflowManifest() {
  return {
    workflowId: ELIGIBILITY_WORKFLOW_ID,
    mode: 'random',
    schemaComposition: 'runtime',
    modules: ELIGIBILITY_WORKFLOW_STEPS.map((s) => ({
      id: s.id,
      title: s.title,
      entityKey: s.entityKey,
      fields: s.fields,
    })),
  };
}

export function pickRandomStep(excludeIds: string[] = []): WorkflowStepDef {
  const pool = ELIGIBILITY_WORKFLOW_STEPS.filter((s) => !excludeIds.includes(s.id));
  const candidates = pool.length > 0 ? pool : ELIGIBILITY_WORKFLOW_STEPS;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
