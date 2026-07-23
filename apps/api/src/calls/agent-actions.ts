import type { AgentRecommendation } from '../types';

type State = Record<string, unknown>;

export interface AgentExecutionResult {
  message: string;
  entityUpdates: Record<string, unknown>;
  agent: AgentRecommendation;
  eligibilityPatch?: Array<Record<string, unknown>>;
  feedback?: {
    scenario: string;
    reason: string;
    originalAction: string;
    at: string;
  };
}

type Handler = (state: State, feedback?: string) => AgentExecutionResult;

function followUp(
  text: string,
  action: string,
  status: 'approved' | 'overridden',
  confidence = 0.92,
  outcome?: string,
): AgentRecommendation {
  return { text, action, confidence, status, outcome };
}

function withOverrideFeedback(
  state: State,
  scenario: string,
  feedback: string | undefined,
  result: AgentExecutionResult,
): AgentExecutionResult {
  const latest = (state.agent as { latest: AgentRecommendation }).latest;
  const reason = feedback?.trim() || 'No reason provided';
  const entry = {
    scenario,
    reason,
    originalAction: latest.action,
    at: new Date().toISOString(),
  };
  return {
    ...result,
    message: `${result.message} — operator note: "${reason}"`,
    agent: followUp(
      result.agent.text,
      result.agent.action,
      'overridden',
      result.agent.confidence,
      `Override reason: ${reason}`,
    ),
    feedback: entry,
  };
}

const APPROVE: Record<string, Handler> = {
  priorAuth: (state) => {
    const priorAuth = { ...(state.priorAuth as State), status: 'submitted', authNumber: 'PA-2026-88421', required: true };
    return {
      message: 'Prior auth submitted to payer portal — auth number assigned',
      entityUpdates: { priorAuth },
      agent: followUp(
        'Prior authorization submitted successfully. Payer typically responds in 2–3 business days.',
        'Monitor PA status',
        'approved',
        0.95,
      ),
    };
  },
  referral: (state) => {
    const referral = {
      ...(state.referral as State),
      status: 'on_file',
      visitsRemaining: 3,
      alert: 'Referral confirmed — 3 visits remaining through Sep 2026.',
    };
    return {
      message: 'Referral request sent to PCP — status updated to on file',
      entityUpdates: { referral },
      agent: followUp('Referral is now on file. Patient can proceed with scheduling.', 'Schedule appointment', 'approved'),
    };
  },
  cob: (state) => {
    const rows = structuredClone((state.eligibility as { rows: State[] }).rows);
    if (rows[1]) rows[1] = { ...rows[1], status: 'active' };
    return {
      message: 'COB billing order applied — Medicare secondary confirmed',
      entityUpdates: {
        cob: { ...(state.cob as State), order: 'Aetna primary ✓ · Medicare secondary ✓' },
      },
      eligibilityPatch: rows,
      agent: followUp('COB order saved. Bill Aetna first, Medicare for remainder.', 'Document in EHR', 'approved'),
    };
  },
  deductible: (state) => {
    const deductible = {
      ...(state.deductible as State),
      remaining: 380,
      remainingLabel: '$380 left',
      met: 1120,
    };
    return {
      message: 'Cost estimate shared with patient — deductible balance updated',
      entityUpdates: { deductible },
      agent: followUp('Patient acknowledged $380 estimated responsibility for this visit.', 'Continue intake', 'approved'),
    };
  },
  pharmacy: (state) => {
    const pharmacy = {
      ...(state.pharmacy as State),
      stepTherapyStatus: 'cleared',
      stepTherapyNote: 'Step therapy requirement satisfied — warfarin trial documented.',
      copay: 30,
    };
    return {
      message: 'Step therapy verified — pharmacy benefit updated',
      entityUpdates: { pharmacy },
      agent: followUp('Eliquis approved at Tier 2 copay ($30). Mail order available.', 'Notify patient', 'approved'),
    };
  },
  claims: (state) => {
    const claims = structuredClone(state.claims as State);
    const summary = { ...(claims.summary as State), status: 'appeal_submitted', denialReason: 'Appeal filed with corrected modifier 25' };
    const rows = [...(claims.rows as State[])];
    if (rows[0]) rows[0] = { ...rows[0], status: 'appeal_submitted' };
    return {
      message: 'Claim appeal initiated — status updated',
      entityUpdates: { claims: { ...claims, summary, rows } },
      agent: followUp('Appeal submitted. Expected payer response in 5–7 business days.', 'Track appeal', 'approved'),
    };
  },
  oon: (state) => {
    const oon = {
      ...(state.oon as State),
      balanceBilling: 'mitigated',
      patientResponsibility: 320,
      riskNote: 'In-network alternative offered — patient chose to proceed with OON provider at reduced responsibility.',
    };
    return {
      message: 'OON financial counseling completed — patient responsibility reduced',
      entityUpdates: { oon },
      agent: followUp('Patient accepted updated financial estimate. Documented in call notes.', 'Close OON review', 'approved'),
    };
  },
  scheduling: (state) => {
    const scheduling = {
      ...(state.scheduling as State),
      urgency: 'booked',
      earliestSlot: 'Tomorrow 9:00 AM (Telehealth)',
    };
    return {
      message: 'Telehealth slot booked for tomorrow 9:00 AM',
      entityUpdates: { scheduling },
      agent: followUp('Appointment confirmed. Confirmation sent to patient portal.', 'Send prep instructions', 'approved'),
    };
  },
  consent: (state) => {
    const consent = {
      ...(state.consent as State),
      overallStatus: 'complete',
      outstandingNote: 'All consents collected for 2026.',
      documents: [
        { document: 'HIPAA Authorization', status: 'signed', signedOn: '2024-01-10' },
        { document: 'Treatment Consent', status: 'signed', signedOn: '2026-07-23' },
        { document: 'Financial Policy 2026', status: 'signed', signedOn: '2026-07-23' },
      ],
    };
    return {
      message: 'Consent forms sent via patient portal — all signed',
      entityUpdates: { consent },
      agent: followUp('All required consents on file for 2026 visit.', 'Proceed with check-in', 'approved'),
    };
  },
  escalation: (state) => {
    const escalation = {
      ...(state.escalation as State),
      level: 'resolved',
      assignedTo: 'Claims Resolution Team',
      sla: 'Met — 2h 14m',
    };
    return {
      message: 'Case escalated to supervisor queue — ticket ESC-2026-44821 created',
      entityUpdates: { escalation },
      agent: followUp('Supervisor assigned. Resolution team will callback within 4 hours.', 'Await callback', 'approved'),
    };
  },
};

const OVERRIDE: Record<string, Handler> = {
  priorAuth: (_state, feedback) => ({
    message: 'Operator overrode PA requirement — proceed without authorization',
    entityUpdates: {
      priorAuth: {
        required: false,
        status: 'overridden',
        reason: feedback?.trim() || 'Operator override — urgent care exception',
      },
    },
    agent: followUp('Override logged. Proceed without prior auth per operator discretion.', 'Document override reason', 'overridden', 0.88),
  }),
  referral: (_state, feedback) => ({
    message: 'Referral requirement waived by operator',
    entityUpdates: {
      referral: {
        required: false,
        status: 'waived',
        alert: feedback?.trim() ? `Referral waived — ${feedback.trim()}` : 'Referral waived — operator override on file.',
      },
    },
    agent: followUp('Referral override recorded. Schedule without referral on file.', 'Document waiver', 'overridden'),
  }),
  default: (state, feedback) => ({
    message: 'Operator override recorded',
    entityUpdates: {},
    agent: followUp(
      feedback?.trim()
        ? `Override applied with operator note: "${feedback.trim()}"`
        : `Override logged for current workflow step. Original recommendation: "${(state.agent as { latest: AgentRecommendation }).latest.action}".`,
      'Review with supervisor',
      'overridden',
      0.85,
    ),
  }),
};

export function executeAgentAction(
  scenario: string | null,
  operatorAction: 'approve' | 'override',
  state: State,
  feedback?: string,
): AgentExecutionResult {
  if (!scenario) {
    const reason = feedback?.trim();
    return {
      message: operatorAction === 'approve' ? 'Recommendation acknowledged' : (reason ? `Override recorded — ${reason}` : 'Override recorded'),
      entityUpdates: {},
      agent: followUp(
        operatorAction === 'approve' ? 'Monitoring call — awaiting next workflow signal.' : (reason ? `Operator chose a different path: ${reason}` : 'Operator chose a different path.'),
        'Continue call',
        operatorAction === 'approve' ? 'approved' : 'overridden',
        0.9,
        reason ? `Override reason: ${reason}` : undefined,
      ),
      feedback: operatorAction === 'override' ? {
        scenario: 'unknown',
        reason: reason || 'No reason provided',
        originalAction: (state.agent as { latest: AgentRecommendation }).latest.action,
        at: new Date().toISOString(),
      } : undefined,
    };
  }

  const handlers = operatorAction === 'approve' ? APPROVE : OVERRIDE;
  const handler = handlers[scenario] ?? OVERRIDE.default;
  const result = handler(state, feedback);
  if (operatorAction === 'override') {
    return withOverrideFeedback(state, scenario, feedback, result);
  }
  return result;
}
