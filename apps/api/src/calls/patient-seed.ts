export interface PatientSeed {
  callId: string;
  label: string;
  patient: Record<string, unknown>;
  provider: Record<string, unknown>;
  eligibility: { rows: Array<Record<string, unknown>> };
}

export const PATIENT_SEEDS: PatientSeed[] = [
  {
    callId: 'call-maria',
    label: 'Maria Gonzalez',
    patient: { name: 'Maria Gonzalez', memberId: 'M-4829103', dob: '1984-03-12', phone: '(555) 234-8891' },
    provider: { name: 'Dr. James Chen', specialty: 'Cardiology', npi: '1234567890' },
    eligibility: {
      rows: [
        { payer: 'Aetna', status: 'active', copay: 25, planTier: 'Gold' },
        { payer: 'Medicare', status: 'pending', copay: 0, planTier: 'Part B' },
      ],
    },
  },
  {
    callId: 'call-robert',
    label: 'Robert Kim',
    patient: { name: 'Robert Kim', memberId: 'M-7712044', dob: '1972-11-08', phone: '(555) 891-4420' },
    provider: { name: 'Dr. Sarah Patel', specialty: 'Orthopedics', npi: '9876543210' },
    eligibility: {
      rows: [
        { payer: 'UnitedHealthcare', status: 'active', copay: 40, planTier: 'Silver' },
        { payer: 'Medicaid', status: 'active', copay: 0, planTier: 'Standard' },
      ],
    },
  },
  {
    callId: 'call-elena',
    label: 'Elena Vasquez',
    patient: { name: 'Elena Vasquez', memberId: 'M-3390182', dob: '1990-06-21', phone: '(555) 712-3309' },
    provider: { name: 'Dr. Michael Torres', specialty: 'Primary Care', npi: '5551234567' },
    eligibility: {
      rows: [
        { payer: 'Cigna', status: 'pending', copay: 30, planTier: 'PPO' },
        { payer: 'Blue Cross', status: 'denied', copay: 0, planTier: 'HMO' },
      ],
    },
  },
  {
    callId: 'call-james',
    label: 'James Wilson',
    patient: { name: 'James Wilson', memberId: 'M-5582910', dob: '1965-01-30', phone: '(555) 402-1188' },
    provider: { name: 'Dr. Anita Rao', specialty: 'Endocrinology', npi: '6677889900' },
    eligibility: {
      rows: [
        { payer: 'Humana', status: 'active', copay: 35, planTier: 'Gold' },
        { payer: 'VA Benefits', status: 'pending', copay: 0, planTier: 'Standard' },
      ],
    },
  },
  {
    callId: 'call-patricia',
    label: 'Patricia Moore',
    patient: { name: 'Patricia Moore', memberId: 'M-9021147', dob: '1958-09-14', phone: '(555) 673-2290' },
    provider: { name: 'Dr. Kevin Brooks', specialty: 'Rheumatology', npi: '4455667788' },
    eligibility: {
      rows: [
        { payer: 'Kaiser', status: 'active', copay: 20, planTier: 'HMO' },
        { payer: 'Medicare Advantage', status: 'active', copay: 15, planTier: 'Part C' },
      ],
    },
  },
];

export const DEFAULT_CALL_ID = PATIENT_SEEDS[0].callId;
