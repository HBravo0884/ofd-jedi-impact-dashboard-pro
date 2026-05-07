// Determines whether a faculty member is a clinician — used to gate
// signature requirement on the kiosk. Clinicians are required to sign
// for CME/legal audit purposes; everyone else is optional.

const CLINICAL_DEGREES = new Set([
  'MD',
  'D.O.',
  'DO',
  'MBBS',
  'MBChB',
  'MBBCh',
  'DDS',
  'DMD',
  'PharmD',
  'BDS',
  'OD',     // optometry
  'DVM',    // veterinary (unlikely here, but cheap)
  'NP',     // nurse practitioner
  'PA',     // physician assistant
  'PA-C',
  'CRNA',
]);

export function isClinicianDegrees(degrees: readonly string[] | null | undefined): boolean {
  if (!degrees || degrees.length === 0) return false;
  for (const raw of degrees) {
    const d = String(raw || '').toUpperCase().replace(/[^A-Z\-]/g, '');
    // Match against normalized clinical degree set (also normalized)
    for (const cand of CLINICAL_DEGREES) {
      const normCand = cand.toUpperCase().replace(/[^A-Z\-]/g, '');
      if (d === normCand) return true;
    }
  }
  return false;
}
