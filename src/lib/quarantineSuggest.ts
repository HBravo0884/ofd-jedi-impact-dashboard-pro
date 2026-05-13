// ─────────────────────────────────────────────────────────────────────────
// quarantineSuggest.ts
//
// Computes ranked merge-candidate suggestions for a PENDING_RESOLUTION
// Faculty profile. Compares the pending row's names + email + aliases
// against every VERIFIED Faculty using:
//
//   - Exact last name match
//   - Exact first name match
//   - Last/first name Levenshtein similarity
//   - Email exact match (non-phantom only)
//   - Alias similarity (pending alias matches verified display name, or
//     verified alias matches pending display name)
//
// Each contribution adds to a 0..1 score and pushes a human-readable
// 'reason' string. Top N candidates above a minimum threshold are returned.
//
// Used by /api/admin/quarantine to power the smart adjudication UI.
// ─────────────────────────────────────────────────────────────────────────

import { levenshteinSimilarity } from './heuristics';

export interface PendingFacultyInput {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  aliases: string[];
  department?: string | null;
}

export interface VerifiedFacultyInput {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  aliases: string[];
  department: string;
  attendances: number;
}

export interface Candidate {
  facultyId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  department: string;
  attendances: number;
  score: number;       // 0..1
  reasons: string[];
}

export function suggestMergeCandidates(
  pending: PendingFacultyInput,
  verifiedFaculty: VerifiedFacultyInput[],
  limit = 5,
  minScore = 0.30,
): Candidate[] {
  const pendingDisplay = `${pending.firstName} ${pending.lastName}`.trim();
  const pendingFirst = pending.firstName.toLowerCase();
  const pendingLast = pending.lastName.toLowerCase();
  const pendingEmailReal =
    pending.email && !pending.email.startsWith('phantom_')
      ? pending.email.toLowerCase()
      : null;

  const out: Candidate[] = [];

  for (const f of verifiedFaculty) {
    if (f.id === pending.id) continue;

    let score = 0;
    const reasons: string[] = [];

    // Last name
    const fLast = f.lastName.toLowerCase();
    if (pendingLast && pendingLast === fLast) {
      score += 0.40;
      reasons.push('Last name exact match');
    } else if (pendingLast && fLast) {
      const sim = levenshteinSimilarity(pendingLast, fLast);
      if (sim >= 0.70) {
        score += 0.20 * sim;
        reasons.push(`Last name ${Math.round(sim * 100)}% similar`);
      }
    }

    // First name
    const fFirst = f.firstName.toLowerCase();
    if (pendingFirst && pendingFirst === fFirst) {
      score += 0.40;
      reasons.push('First name exact match');
    } else if (pendingFirst && fFirst) {
      const sim = levenshteinSimilarity(pendingFirst, fFirst);
      if (sim >= 0.70) {
        score += 0.20 * sim;
        reasons.push(`First name ${Math.round(sim * 100)}% similar`);
      }
    }

    // Real email match
    if (pendingEmailReal && f.email && f.email.toLowerCase() === pendingEmailReal) {
      score += 0.50;
      reasons.push('Email exact match');
    }

    // Department overlap (helps disambiguate same-name people)
    if (
      pending.department &&
      f.department &&
      String(pending.department).toLowerCase() === String(f.department).toLowerCase() &&
      f.department !== 'Other'
    ) {
      score += 0.10;
      reasons.push(`Same department (${f.department.replace(/([A-Z])/g, ' $1').trim()})`);
    }

    // Pending's display name fuzzy-matches one of f's aliases
    const fDisplay = `${f.firstName} ${f.lastName}`.trim();
    for (const alias of f.aliases || []) {
      const sim = levenshteinSimilarity(alias, pendingDisplay);
      if (sim >= 0.85) {
        score += 0.40;
        reasons.push(`Alias "${alias}" is ${Math.round(sim * 100)}% similar`);
        break;
      }
    }
    // f's display name fuzzy-matches one of pending's aliases
    for (const alias of pending.aliases || []) {
      const sim = levenshteinSimilarity(alias, fDisplay);
      if (sim >= 0.85) {
        score += 0.30;
        reasons.push(`Pending alias "${alias}" is ${Math.round(sim * 100)}% similar`);
        break;
      }
    }

    // Initial-style: "S. Nandi" vs "Sayan Nandi" — first initial + same last
    if (pendingLast && pendingLast === fLast && pendingFirst.length <= 2 && fFirst.length > 2) {
      if (pendingFirst.replace(/[^a-z]/g, '').charAt(0) === fFirst.charAt(0)) {
        score += 0.30;
        reasons.push(`Initial match: "${pending.firstName.charAt(0)}." → "${f.firstName}"`);
      }
    }
    if (pendingLast && pendingLast === fLast && fFirst.length <= 2 && pendingFirst.length > 2) {
      if (fFirst.replace(/[^a-z]/g, '').charAt(0) === pendingFirst.charAt(0)) {
        score += 0.30;
        reasons.push(`Initial match: "${f.firstName.charAt(0)}." → "${pending.firstName}"`);
      }
    }

    if (score >= minScore) {
      out.push({
        facultyId: f.id,
        firstName: f.firstName,
        lastName: f.lastName,
        email: f.email,
        department: f.department,
        attendances: f.attendances,
        score: Math.min(score, 1),
        reasons,
      });
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
