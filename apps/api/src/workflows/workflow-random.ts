import type { PatientSeed } from '../calls/patient-seed';
import type { WorkflowStepDef } from './eligibility-workflow';

export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

export function shuffleModuleIds(moduleIds: string[], callId: string, cycle = 0): string[] {
  const rng = seededRandom(hashString(`${callId}:cycle:${cycle}`));
  const deck = [...moduleIds];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const PCPS = ['Dr. Torres', 'Dr. Nguyen', 'Dr. Walsh', 'Dr. Okonkwo', 'Dr. Singh'];
const PROCEDURES = [
  'CPT 93306 — Echocardiogram',
  'CPT 73721 — MRI Knee',
  'CPT 99214 — E/M Follow-up',
  'CPT 96413 — Chemotherapy infusion',
  'CPT 27130 — Total hip arthroplasty consult',
  'CPT 45378 — Colonoscopy',
];
const DRUGS = ['Eliquis 5mg', 'Ozempic 1mg', 'Humira 40mg', 'Jardiance 10mg', 'Entresto 24-26mg'];
const DENIAL_REASONS = [
  'Missing modifier 25 on E/M visit',
  'Prior auth not on file',
  'Service not covered under plan',
  'Duplicate claim submitted',
  'Out-of-network provider',
];
const LOCATIONS = ['Main Campus — Bldg C', 'North Clinic — Suite 210', 'Telehealth Hub', 'Downtown Medical Plaza'];

export function personalizeModuleState(def: WorkflowStepDef, seed: PatientSeed): Record<string, unknown> {
  const state = structuredClone(def.state);
  const h = hashString(`${seed.callId}:${def.id}`);
  const rng = seededRandom(h);
  const providerName = String(seed.provider.name);
  const specialty = String(seed.provider.specialty);
  const primaryPayer = String(seed.eligibility.rows[0]?.payer ?? 'Primary');
  const secondaryPayer = String(seed.eligibility.rows[1]?.payer ?? 'Secondary');

  switch (def.id) {
    case 'priorAuth': {
      const procedure = PROCEDURES[h % PROCEDURES.length];
      state.priorAuth = {
        ...(state.priorAuth as Record<string, unknown>),
        procedure,
        payerPortal: `${primaryPayer} Precert`,
        authNumber: `PA-${2026}${(h % 90000) + 10000}`,
        reason: `${specialty} visit requires ${primaryPayer} pre-authorization for ${procedure.split('—')[1]?.trim() ?? 'service'}`,
      };
      break;
    }
    case 'referral':
      state.referral = {
        ...(state.referral as Record<string, unknown>),
        specialist: `${providerName} — ${specialty}`,
        pcp: PCPS[h % PCPS.length],
        visitsRemaining: h % 4,
        expiresOn: `2026-${String((h % 6) + 6).padStart(2, '0')}-${String((h % 20) + 10).padStart(2, '0')}`,
        alert: `No ${specialty.toLowerCase()} referral on file for ${seed.patient.name}. Request from PCP.`,
      };
      break;
    case 'cob':
      state.cob = {
        ...(state.cob as Record<string, unknown>),
        primaryPayer,
        secondaryPayer,
        order: `${primaryPayer} → ${secondaryPayer}`,
        rule: `${secondaryPayer} secondary when ${primaryPayer} is primary employer coverage`,
      };
      break;
    case 'deductible': {
      const annual = 1000 + (h % 6) * 250;
      const met = Math.min(annual - 50, Math.floor(annual * (0.25 + rng() * 0.55)));
      const oopMax = annual * 3 + (h % 3) * 500;
      const oopMet = Math.floor(oopMax * (0.2 + rng() * 0.4));
      const remaining = annual - met;
      state.deductible = {
        annual,
        met,
        oopMax,
        oopMet,
        remaining,
        oopRemaining: oopMax - oopMet,
        remainingLabel: `$${remaining.toLocaleString()} left`,
        planYear: '2026',
      };
      break;
    }
    case 'pharmacy': {
      const drug = DRUGS[h % DRUGS.length];
      const copay = 15 + (h % 5) * 10;
      state.pharmacy = {
        ...(state.pharmacy as Record<string, unknown>),
        priorAuthDrug: drug,
        copay,
        formulary: `Tier ${1 + (h % 3)}`,
        stepTherapyNote: `${drug} requires completed trial or documented intolerance per ${primaryPayer} formulary.`,
      };
      break;
    }
    case 'claims': {
      const amount = 180 + (h % 12) * 95;
      const denialReason = DENIAL_REASONS[h % DENIAL_REASONS.length];
      state.claims = {
        summary: {
          status: h % 3 === 0 ? 'paid' : 'denied',
          lastAmount: amount,
          totalDenied: 1 + (h % 4),
          totalPaid: 1200 + (h % 8) * 320,
          denialReason,
        },
        rows: [
          { date: '2026-05-14', code: `9921${h % 5}`, amount, status: h % 3 === 0 ? 'paid' : 'denied' },
          { date: '2026-04-02', code: `9300${h % 3}`, amount: Math.floor(amount * 0.35), status: 'paid' },
          { date: '2026-03-18', code: `8005${h % 4}`, amount: Math.floor(amount * 0.2), status: 'paid' },
        ],
      };
      break;
    }
    case 'oon': {
      const billed = 800 + (h % 10) * 120;
      const allowed = Math.floor(billed * (0.35 + rng() * 0.25));
      const patientResp = billed - allowed;
      state.oon = {
        inNetwork: false,
        allowedAmount: allowed,
        billedAmount: billed,
        patientResponsibility: patientResp,
        balanceBilling: patientResp > 500 ? 'high' : 'moderate',
        riskNote: `${providerName} is OON for ${primaryPayer}. Patient may owe $${patientResp.toLocaleString()} above allowed.`,
      };
      break;
    }
    case 'scheduling': {
      const daysOut = 2 + (h % 14);
      const month = 7 + Math.floor(daysOut / 28);
      const day = (daysOut % 28) + 1;
      state.scheduling = {
        ...(state.scheduling as Record<string, unknown>),
        earliestSlot: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        location: LOCATIONS[h % LOCATIONS.length],
        visitType: specialty,
        urgency: daysOut <= 3 ? 'urgent' : 'routine',
      };
      break;
    }
    case 'consent':
      state.consent = {
        ...(state.consent as Record<string, unknown>),
        outstandingNote: `${seed.patient.name} — financial policy consent for 2026 not signed.`,
      };
      break;
    case 'escalation':
      state.escalation = {
        ...(state.escalation as Record<string, unknown>),
        reason: `${primaryPayer} / ${secondaryPayer} COB conflict + ${specialty.toLowerCase()} auth gap for ${seed.patient.name}.`,
        caseId: `ESC-2026-${(h % 90000) + 10000}`,
      };
      break;
    default:
      break;
  }

  return state;
}

export function personalizeAgent(def: WorkflowStepDef, seed: PatientSeed): WorkflowStepDef['agent'] {
  const patientName = String(seed.patient.name);
  const primaryPayer = String(seed.eligibility.rows[0]?.payer ?? 'payer');
  const agent = { ...def.agent };

  const hints: Partial<Record<string, string>> = {
    priorAuth: `${primaryPayer} prior auth required for ${seed.provider.specialty} visit — ${patientName}.`,
    referral: `No ${seed.provider.specialty} referral on file for ${patientName}.`,
    cob: `${primaryPayer} primary, ${seed.eligibility.rows[1]?.payer ?? 'secondary'} COB order needs confirmation.`,
    deductible: `${patientName} has deductible remaining — verify estimated responsibility.`,
    pharmacy: `Rx benefit review for ${patientName} — check step therapy on ${primaryPayer}.`,
    claims: `Recent ${primaryPayer} claim issue for ${patientName} — review denial.`,
    oon: `${seed.provider.name} may be out-of-network for ${patientName}.`,
    scheduling: `Scheduling gap for ${patientName} — ${seed.provider.specialty} availability limited.`,
    consent: `Consent gap on file for ${patientName}.`,
    escalation: `Complex ${seed.provider.specialty} case for ${patientName} — multiple blockers.`,
  };

  if (hints[def.id]) agent.text = hints[def.id]!;
  return agent;
}
