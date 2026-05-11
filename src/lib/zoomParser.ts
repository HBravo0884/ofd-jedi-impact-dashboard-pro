// ─────────────────────────────────────────────────────────────────────────
// zoomParser.ts — robust parser for Zoom monthly meeting-detail exports
// ─────────────────────────────────────────────────────────────────────────
//
// Zoom's "meeting list details" CSV is a multi-event monthly export where:
//   - One file contains MANY meeting instances, each with its own attendees
//   - The header has 26 columns
//   - There are TWO "Duration (minutes)" columns (positions 9 and 23,
//     1-indexed). The first is meeting-level; the second is participant-
//     level. PapaParse with header:true silently overwrites one with the
//     other — that's the subtle bug we're avoiding.
//
// We parse by COLUMN INDEX, not by header name, so duplicates don't collide.
// We ALSO validate the header structurally so unrelated files (registration
// rosters, administrative-unit reference files) don't get misclassified.

// ─── Column index map (0-indexed) ────────────────────────────────────────
//
//  0  Topic
//  1  Type
//  2  ID
//  3  Host name
//  4  Host email
//  5  Start time
//  6  End time
//  7  Participants
//  8  Duration (minutes)         ← MEETING-LEVEL
//  9  Total participant minutes
// 10  Department
// 11  Group
// 12  Source
// 13  Unique viewers
// 14  Max concurrent views
// 15  Creation time
// 16  EmpID
// 17  MajorUnit
// 18  Name (original name)
// 19  Email
// 20  Join time
// 21  Leave time
// 22  Duration (minutes)         ← PARTICIPANT-LEVEL  (use this for attendance)
// 23  Guest
// 24  Recording disclaimer response
// 25  In waiting room
// ──────────────────────────────────────────────────────────────────────────

const COL = {
  topic: 0,
  type: 1,
  meetingId: 2,
  hostName: 3,
  hostEmail: 4,
  startTime: 5,
  endTime: 6,
  participants: 7,
  meetingDuration: 8,        // meeting-level
  totalParticipantMinutes: 9,
  name: 18,
  email: 19,
  joinTime: 20,
  leaveTime: 21,
  participantDuration: 22,   // participant-level — THE one we want for attendance
  guest: 23,
} as const;

export type FileKind =
  | 'zoom-meeting-details'
  | 'zoom-registration'
  | 'admin-units'
  | 'master-dataset'
  | 'unknown';

export interface DetectionResult {
  kind: FileKind;
  reason: string;
}

export interface ParsedAttendee {
  /** Raw "Name (original name)" text, e.g. "Veronica Bruce (Host)". */
  rawName: string;
  /** Cleaned-for-display name, with "(Host)"/"(Co-host)" stripped. */
  displayName: string;
  /** Lowercased, whitespace-normalized, parens-stripped — used for dedup. */
  normalizedName: string;
  email: string;
  /** Participant-level minutes from column 23. After consolidation, this
   *  is the SUM of all join-instances for this person within the event. */
  duration: number;
  joinTime: string;
  leaveTime: string;
  isGuest: boolean;
  /** How many raw CSV rows were consolidated into this attendee record.
   *  1 = single join. >1 = the person joined-then-left-then-rejoined.
   *  When > 1, duration is the sum of the per-join durations, joinTime is
   *  the earliest join, and leaveTime is the latest leave. */
  joinCount: number;
  /** Concatenated raw names from every consolidated source row, comma-
   *  separated. Useful for the UI to show "joined as: X, Y" when the
   *  same person appeared under slightly different display names. */
  rawNames: string;
}

export interface ParsedEventGroup {
  /** Stable key: topic|meetingId|startTime. */
  key: string;
  topic: string;
  meetingId: string;
  /** Raw "M/D/YYYY HH:MM" from the file. */
  startTime: string;
  endTime: string;
  /** ISO YYYY-MM-DD derived from startTime; null if unparseable. */
  startDate: string | null;
  /** Meeting-level duration (column 9). */
  meetingDuration: number;
  attendees: ParsedAttendee[];

  // ── Preview stats ────────────────────────────────────────────────────
  rawRowCount: number;          // attendees array length
  uniqueParticipants: number;   // by normalizedName
  missingEmailCount: number;
  underTenMinCount: number;
  /** True when uniqueParticipants < 5 (matches backend ghost-session filter). */
  isLikelyGhost: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => !cell || !String(cell).trim());
}

function stripParentheticals(s: string): string {
  // "Veronica Bruce (Host)" → "Veronica Bruce"
  // "Sayan Nandi (Co-host)" → "Sayan Nandi"
  return String(s || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeName(s: string): string {
  return stripParentheticals(s).toLowerCase();
}

/**
 * Parse "M/D/YYYY HH:MM" or "M/D/YYYY H:MM" into ISO YYYY-MM-DD.
 * Returns null if the input doesn't match.
 * Examples accepted: "7/31/2025 11:54", "12/12/2025 9:55", "4/27/2026 12:01"
 */
function toIsoDate(s: string): string | null {
  const m = String(s || '').match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function toNum(s: string): number {
  const n = parseInt(String(s || '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

// ─── File-kind detection ──────────────────────────────────────────────────

/**
 * Inspect the header row to figure out what kind of file we're looking at.
 * The most important check: the Zoom Meeting Details export has TWO columns
 * named exactly "Duration (minutes)" (case-insensitive). That signature is
 * specific enough to distinguish it from registration rosters, admin-unit
 * tables, and the master historical dataset.
 */
export function detectFileKind(rows: string[][]): DetectionResult {
  if (!rows || rows.length === 0) {
    return { kind: 'unknown', reason: 'Empty file.' };
  }
  const header = (rows[0] || []).map((c) => String(c || '').trim().toLowerCase());

  // Zoom Meeting Details — look for the two "duration (minutes)" columns
  const durationIndices: number[] = [];
  for (let i = 0; i < header.length; i++) {
    if (header[i] === 'duration (minutes)') durationIndices.push(i);
  }
  const hasTopic = header[0] === 'topic';
  const hasName = header.includes('name (original name)');

  if (hasTopic && hasName && durationIndices.length === 2) {
    return {
      kind: 'zoom-meeting-details',
      reason: 'Zoom Meeting Details export (multi-event monthly file).',
    };
  }

  // Zoom Registration rosters typically have these columns
  if (header.includes('registration time') || header.includes('attended') || header.includes('approval status')) {
    return {
      kind: 'zoom-registration',
      reason: 'Zoom Registration roster — pre-event signups, not attendance. Will not be ingested.',
    };
  }

  // Administrative units / department taxonomy
  if (
    (header.includes('department') || header.includes('major unit')) &&
    !hasTopic &&
    !hasName
  ) {
    return {
      kind: 'admin-units',
      reason: 'Administrative-units / taxonomy reference file. Will not be ingested as attendance.',
    };
  }

  // Historical master dataset (one big concatenation of past months)
  if (header.includes('event') && header.includes('event date') && header.includes('faculty')) {
    return {
      kind: 'master-dataset',
      reason: 'Historical master dataset. Use the dedicated importer (not yet implemented) — ignored here.',
    };
  }

  return {
    kind: 'unknown',
    reason: 'File format not recognized. Expected a Zoom Meeting Details CSV.',
  };
}

// ─── Main parser ──────────────────────────────────────────────────────────

/**
 * Group a parsed-but-untrimmed Zoom Meeting Details CSV into event groups.
 * Skips the header row and any blank separator rows. Index-based — does not
 * use object keys, so the duplicate "Duration (minutes)" headers are safe.
 *
 * Grouping key: `${topic}|${meetingId}|${startTime}` — captures the
 * possibility that the same Topic runs multiple times in one month.
 */
export function parseMeetingDetails(rows: string[][]): ParsedEventGroup[] {
  if (!rows || rows.length < 2) return [];

  // Build groups using a Map keyed on topic|id|startTime so the same Topic
  // running twice in a month produces two distinct groups.
  const groups = new Map<string, ParsedEventGroup>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || isBlankRow(row)) continue;

    const topic = String(row[COL.topic] || '').trim();
    const meetingId = String(row[COL.meetingId] || '').trim();
    const startTime = String(row[COL.startTime] || '').trim();
    if (!topic || !meetingId || !startTime) continue; // not an attendee row

    const key = `${topic}|${meetingId}|${startTime}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        topic,
        meetingId,
        startTime,
        endTime: String(row[COL.endTime] || '').trim(),
        startDate: toIsoDate(startTime),
        meetingDuration: toNum(row[COL.meetingDuration]),
        attendees: [],
        rawRowCount: 0,
        uniqueParticipants: 0,
        missingEmailCount: 0,
        underTenMinCount: 0,
        isLikelyGhost: false,
      };
      groups.set(key, group);
    }

    const rawName = String(row[COL.name] || '').trim();
    if (!rawName) continue;

    group.attendees.push({
      rawName,
      displayName: stripParentheticals(rawName),
      normalizedName: normalizeName(rawName),
      email: String(row[COL.email] || '').trim(),
      duration: toNum(row[COL.participantDuration]), // ← column 23, the participant one
      joinTime: String(row[COL.joinTime] || '').trim(),
      leaveTime: String(row[COL.leaveTime] || '').trim(),
      isGuest: String(row[COL.guest] || '').trim().toLowerCase() === 'yes',
      joinCount: 1,
      rawNames: rawName,
    });
  }

  // ── Consolidate duplicate rows within each event group ─────────────
  // Zoom records a fresh row every time someone joins (so a re-join shows
  // as two rows). Collapse by normalizedName: sum durations, take earliest
  // join + latest leave, prefer the row that has an email if any of them
  // do. joinCount > 1 signals to the UI that this is a consolidated row.
  for (const g of groups.values()) {
    const byName = new Map<string, ParsedAttendee>();
    for (const a of g.attendees) {
      const key = a.normalizedName;
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, {
          ...a,
          joinCount: 1,
          rawNames: a.rawName,
        });
      } else {
        // Sum participant-level minutes across joins.
        existing.duration += a.duration;
        existing.joinCount += 1;
        // Append the raw display name if it's different (e.g., "(Host)").
        if (!existing.rawNames.split(/,\s*/).includes(a.rawName)) {
          existing.rawNames = existing.rawNames + ', ' + a.rawName;
        }
        // Prefer a non-empty email if we got one from a different row.
        if (!existing.email && a.email) existing.email = a.email;
        // Earliest join, latest leave (lexical compare is fine for HH:MM
        // strings within the same day; not always perfect but good for UI).
        if (a.joinTime && (!existing.joinTime || a.joinTime < existing.joinTime)) {
          existing.joinTime = a.joinTime;
        }
        if (a.leaveTime && (!existing.leaveTime || a.leaveTime > existing.leaveTime)) {
          existing.leaveTime = a.leaveTime;
        }
        // isGuest stays as it was on the first row; non-issue for UI.
      }
    }
    g.attendees = Array.from(byName.values());
  }

  // Compute preview stats per group AFTER consolidation, so the numbers
  // the admin sees match the rows that will actually be sent.
  for (const g of groups.values()) {
    g.rawRowCount = g.attendees.length;
    g.uniqueParticipants = g.attendees.length; // by construction after consolidation
    g.missingEmailCount = g.attendees.filter((a) => !a.email).length;
    g.underTenMinCount = g.attendees.filter((a) => a.duration < 10).length;
    g.isLikelyGhost = g.uniqueParticipants < 5;
  }

  // Return in the order they were first encountered, but sort by start
  // date descending so newest events appear at the top of the preview.
  return Array.from(groups.values()).sort((a, b) =>
    String(b.startDate || '').localeCompare(String(a.startDate || ''))
  );
}

/**
 * Convert a ParsedEventGroup into the payload shape the existing
 * /api/ingest route expects. Backend identity matching is unchanged.
 */
export function eventGroupToIngestPayload(
  g: ParsedEventGroup,
  opts: { seriesId?: string }
): {
  eventTitle: string;
  eventDate: string;
  baseDuration: number;
  seriesId?: string;
  attendees: Array<{ name: string; email: string; duration: number }>;
} {
  return {
    eventTitle: g.topic,
    eventDate: g.startDate || new Date().toISOString().slice(0, 10),
    baseDuration: g.meetingDuration || 60,
    ...(opts.seriesId ? { seriesId: opts.seriesId } : {}),
    attendees: g.attendees.map((a) => ({
      name: a.rawName,         // pass raw — backend's heuristics strip "(Host)" etc.
      email: a.email,
      duration: a.duration,    // number — backend coerces defensively, Prisma needs Int
    })),
  };
}
