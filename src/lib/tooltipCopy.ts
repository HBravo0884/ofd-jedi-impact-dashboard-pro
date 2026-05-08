/**
 * Centralized tooltip copy. Import these strings rather than hard-coding
 * `title="..."` so wording can be updated in one place.
 *
 * Usage:
 *   import { TOOLTIPS } from '@/lib/tooltipCopy';
 *   <button title={TOOLTIPS.adminNav.engagement}>Engagement</button>
 */

export const TOOLTIPS = {
  adminNav: {
    engagement:
      'Charts and metrics summarizing faculty engagement across series',
    manageEvents:
      'Create, edit, or delete events. Schedule new sessions and rosters.',
    manageData:
      'Upload attendance CSVs. Drag-drop sheets to ingest into the system.',
    kiosk:
      'Open the touchscreen kiosk for in-person attendee check-in',
    signatureTrainer:
      'Train baseline signatures for faculty so the system can verify them',
    verificationAudit:
      'Run verification tests to demonstrate accuracy to the CME committee',
    settings:
      'Tune signature scoring thresholds and other admin preferences',
    signOut: 'End your admin session and return to the public dashboard',
  },

  publicNav: {
    engagement:
      'Charts and metrics summarizing faculty engagement across series',
    methods:
      'How the data is collected and how engagement scores are computed',
    roster:
      'Browse the faculty directory by department, division, and position',
    drilldown:
      'Per-faculty engagement detail with session-level breakdown',
  },

  charts: {
    breadthVsDepth:
      "Each bubble is a department. Right = more unique people engaged · Up = more sessions per person · Size = total engagements. Use this to spot departments with high reach but shallow engagement, vs. small-but-loyal departments.",
    sessionsXSeries:
      'Each dot is a faculty member. Right = more total sessions; up = attended a wider variety of series.',
    positionTypeDonut:
      'How attendance breaks down by faculty rank — clinical, research, administrative, etc.',
    topEngagedBar:
      'Top faculty by total session count. Color-coded by department.',
    downloadPNG: 'Download chart as a PNG image',
    downloadCSV: 'Download underlying data as a CSV file',
  },

  kiosk: {
    eventTile: 'Tap to start check-in for this event',
    nameInput: 'Type your name. Tap your row when it appears.',
    signaturePad:
      'Sign with your finger. The signature is matched against your baseline.',
    clearSignature: 'Erase the current signature and start over',
    submit: 'Save check-in. You will see a confirmation screen.',
    skipSignature:
      'Submit without a signature. Available for non-clinical faculty.',
    backToList: 'Return to the event picker without checking in',
    adminUnlock: 'Five-tap unlock for admin tools',
  },

  events: {
    create: 'Create a new event in the selected series',
    edit: "Edit this event's date, time, location, or roster",
    delete:
      'Permanently remove this event. Attendance records will be unlinked.',
    printSignIn:
      'Open the printable HU CME-format attendance sheet for this event',
    filterBySeries: 'Show only events from this series',
    seriesChip: 'Click to filter the list by this series',
  },

  ingestion: {
    dropZone: 'Drag a CSV file here, or click to browse',
    browse: 'Pick a CSV from your computer',
    submit: 'Upload this CSV and merge it into the attendance database',
    cancel: 'Discard the staged file without saving',
    history: 'Open the audit log of all previous ingestions',
  },

  audit: {
    startSession: 'Begin a new verification audit session for the CME committee',
    addAttempt: 'Record a new ground-truth-labeled signature attempt',
    printReport:
      'Print a one-page committee report with confusion matrix and metrics',
    matrixCell: 'Click to filter the per-attempt list by this cell',
    attemptPreview: 'The signature as captured during the audit attempt',
  },

  settings: {
    presetLenient:
      'Loose thresholds — favors low false-rejects. Use when training data is thin.',
    presetNormal:
      'Default balanced thresholds. Recommended for everyday operation.',
    presetStrict:
      'Tighter thresholds — favors low false-accepts. Use when audit rigor matters.',
    presetClinicalAudit:
      'Tightest thresholds. Designed for CME committee evidence.',
    verifiedMin:
      "Minimum score to label a signature 'Verified'. Lower = more permissive.",
    likelyMin:
      "Minimum score to label a signature 'Likely match'.",
    weakMin:
      "Minimum score to label a signature 'Weak match'. Below this is 'Poor match'.",
    retryMin:
      'Below this score the kiosk auto-prompts the attendee to retry.',
    dtwMaxPerNode:
      'Cap on per-node DTW distance. Higher = more tolerant of shape variation.',
    aspectRatioK:
      'How much to penalize signatures whose width:height ratio differs from baseline.',
    strokeCountK:
      'How much to penalize signatures whose stroke count differs from baseline.',
    pathLengthK:
      'How much to penalize signatures whose total ink length differs from baseline.',
    resetPreset:
      "Discard advanced overrides and return to the selected preset's values.",
    save:
      'Persist current settings to the database. Takes effect on the next signature check.',
  },

  kpi: {
    uniqueFaculty:
      'Distinct faculty members with at least one attendance record',
    totalEngagements: 'Sum of all attendance rows across all events',
    avgSessionsPerFaculty: 'Total engagements ÷ unique faculty engaged',
    seriesActive: 'Number of series with at least one event in the date range',
  },
} as const;

export type TooltipKey = keyof typeof TOOLTIPS;
