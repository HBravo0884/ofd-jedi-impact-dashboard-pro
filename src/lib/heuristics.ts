// The "Sherlock Holmes" Inference Engine
// Translates messy unstructured CSV inputs into the Canonical Faculty Directory

export interface ParsedProfile {
  cleanName: string;
  email: string;
  duration: number;
  inferredDivision: string;
  inferredRank: string;
  inferredDegrees: string[];
  rawAliases: string[];
}

/**
 * DNA-Sequencing (Levenshtein Algorithm)
 * Used to mathematically calculate character-by-character string drift.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1).toLowerCase() === a.charAt(j - 1).toLowerCase()) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(matrix[i][j - 1] + 1, // insertion
                   matrix[i - 1][j] + 1) // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function isDnaMatch(str1: string, str2: string, threshold = 0.85): boolean {
  return levenshteinSimilarity(str1, str2) >= threshold;
}

/** Levenshtein-based similarity score, 0..1 (1 = identical). Case-insensitive. */
export function levenshteinSimilarity(str1: string, str2: string): number {
  const a = String(str1 || '');
  const b = String(str2 || '');
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  return (maxLen - distance) / maxLen;
}

/**
 * The Extractor Algorithm
 * Evaluates the Zoom Name and Email to geometrically infer their institutional schema.
 */
export function extractCanonicalIdentity(rawName: string, rawEmail: string, rawDuration: number): ParsedProfile {
  let cleanName = rawName.trim();
  let email = rawEmail?.trim().toLowerCase() || '';
  
  let inferredDivision = 'Other';
  let inferredRank = 'Unknown';
  let inferredDegrees: string[] = [];

  // ==========================================
  // Domain Inference Matrix (Email Parsing)
  // ==========================================
  if (email.endsWith('@bison.howard.edu')) {
    inferredRank = 'Student';
  } else if (email.endsWith('@huhosp.org')) {
    inferredDivision = 'Clinical';
  } else if (email.endsWith('@howard.edu')) {
    inferredRank = 'Staff'; // Baseline assumption if Howard employee
  }

  // ==========================================
  // Credential & Tag Inference Matrix (Name Parsing)
  // ==========================================
  
  // 1. Detect Clinical Tags
  if (cleanName.includes('[C]') || cleanName.includes('(C)')) {
    inferredDivision = 'Clinical';
    if (!inferredDegrees.includes('MD')) inferredDegrees.push('MD');
    cleanName = cleanName.replace(/\[c\]|\(c\)/gi, '').trim();
  }

  // 2. Extract Titles & Degrees natively
  // E.g., "Dr. Smith, John, MD, PhD"
  const titleRegex = /(Dr\.|Mr\.|Ms\.|Mrs\.)/gi;
  if (titleRegex.test(cleanName)) {
    cleanName = cleanName.replace(titleRegex, '').trim();
  }

  const degreePatterns = ['MD', 'DO', 'PhD', 'MBA', 'MS', 'RN', 'DDS'];
  for (const degree of degreePatterns) {
    const rx = new RegExp(`\\b${degree}\\b`, 'gi');
    if (rx.test(cleanName)) {
      if (!inferredDegrees.includes(degree)) inferredDegrees.push(degree);
      cleanName = cleanName.replace(rx, '').trim();
    }
  }

  // Clean trailing commas after stripping degrees
  cleanName = cleanName.replace(/,+$/, '').trim();
  // Strip double spaces
  cleanName = cleanName.replace(/\s{2,}/g, ' ');

  // ==========================================
  // Logical Fallbacks & User Defaults
  // ==========================================
  
  // If they are a verified Howard employee without [C], MD, or Student status, infer PhD contextually
  if ((email.endsWith('@howard.edu') || inferredRank === 'Staff') && !inferredDegrees.includes('MD') && inferredRank !== 'Student') {
     // Based on methodology: Howard Faculty non-clinician assumed PhD track logic mapping 
     if (!inferredDegrees.includes('PhD')) inferredDegrees.push('PhD');
     inferredRank = 'Faculty'; // Promote from staff
  }

  return {
    cleanName,
    email,
    duration: isNaN(rawDuration) ? 0 : rawDuration,
    inferredDivision,
    inferredRank,
    inferredDegrees,
    rawAliases: [rawName] // Feed machine learning loop by storing original spelling
  };
}
