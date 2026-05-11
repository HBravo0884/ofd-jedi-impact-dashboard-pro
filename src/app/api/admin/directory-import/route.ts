import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdmin } from '@/lib/adminAuth';
import { prisma } from '@/lib/prisma';
import { isDnaMatch } from '@/lib/heuristics';

export const revalidate = 0;

// ── POST /api/admin/directory-import ─────────────────────────────────────
// Admin-only. Takes a parsed directory roster (the format produced by
// parseDirectoryRoster in zoomParser.ts) and UPDATES matching Faculty
// rows in place. Does NOT create attendance records. Does NOT create
// new faculty unless body.createMissing is true.
//
// Match order (per-row):
//   T1: exact email match (case-insensitive) against Faculty.email
//   T2: exact firstName + lastName match (case-insensitive)
//   T3: fuzzy alias match (Levenshtein-style ≥0.85) against aliases[]
//   T4: not matched — skip (or create if createMissing=true)
//
// For matched rows, ALWAYS updates fields that are present in the
// incoming row and SAFE to overwrite (email, adminTitle, positionType,
// division, degrees union, aliases union). Department (enum) and rank
// (enum) are only updated when the incoming value normalizes cleanly
// to an enum member — otherwise they're left alone.
type IncomingRow = {
  name: string;
  email: string;
  dept: string;
  division: string;
  rank: string;
  degree: string;
  pos: string;
  adminTitle: string;
};

// Map "Internal Medicine" / "Community & Family Medicine" / etc. to the
// Prisma enum value. Returns null if no clean match (caller leaves the
// existing department untouched).
const DEPT_ENUM_MAP: Record<string, string> = {
  anatomy: 'Anatomy',
  biochemistry: 'Biochemistry',
  'biochemistry & molecular biology': 'Biochemistry',
  microbiology: 'Microbiology',
  pathology: 'Pathology',
  pharmacology: 'Pharmacology',
  physiology: 'Physiology',
  'physiology & biophysics': 'Physiology',
  anesthesiology: 'Anesthesiology',
  'community & family medicine': 'CommunityFamilyMedicine',
  'community family medicine': 'CommunityFamilyMedicine',
  dermatology: 'Dermatology',
  medicine: 'Medicine',
  'internal medicine': 'Medicine',
  neurology: 'Neurology',
  'obstetrics & gynecology': 'ObstetricsGynecology',
  'obstetrics and gynecology': 'ObstetricsGynecology',
  obgyn: 'ObstetricsGynecology',
  ophthalmology: 'Ophthalmology',
  'orthopaedic surgery': 'OrthopaedicSurgery',
  'orthopedic surgery': 'OrthopaedicSurgery',
  'pediatrics & child health': 'Pediatrics',
  pediatrics: 'Pediatrics',
  psychiatry: 'Psychiatry',
  'radiation oncology': 'RadiationOncology',
  radiology: 'Radiology',
  surgery: 'Surgery',
  'medical education': 'MedicalEducation',
  administration: 'Administration',
  "dean's office": 'Administration',
  "dean's office / com admin": 'Administration',
  student: 'Student',
  other: 'Other',
};

function normalizeDept(dept: string): string | null {
  const k = dept.trim().toLowerCase().replace(/\s+/g, ' ');
  return DEPT_ENUM_MAP[k] || null;
}

const RANK_ENUM = new Set([
  'Instructor', 'AssistantProfessor', 'AssociateProfessor', 'Professor',
  'Staff', 'Faculty', 'Student', 'Unknown',
]);

// "Assistant Professor" → "AssistantProfessor"; null if no match.
function normalizeRank(rank: string): string | null {
  const cleaned = rank.replace(/[^a-zA-Z]/g, '');
  for (const r of RANK_ENUM) {
    if (r.toLowerCase() === cleaned.toLowerCase()) return r;
  }
  return null;
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] || '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export async function POST(req: Request) {
  const jar = await cookies();
  if (!(await verifyAdmin(jar.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  const rows: IncomingRow[] = Array.isArray(body.rows) ? body.rows : [];
  const createMissing: boolean = !!body.createMissing;
  if (rows.length === 0) {
    return NextResponse.json({ error: 'rows array required' }, { status: 400 });
  }

  const allFaculty = await prisma.faculty.findMany({
    select: { id: true, firstName: true, lastName: true, email: true, aliases: true },
  });
  const byEmail = new Map<string, typeof allFaculty[number]>();
  const byName = new Map<string, typeof allFaculty[number]>();
  for (const f of allFaculty) {
    if (f.email) byEmail.set(f.email.toLowerCase(), f);
    byName.set(`${f.firstName.toLowerCase()}|${f.lastName.toLowerCase()}`, f);
  }

  type RowResult = {
    sourceName: string;
    tier: 'T1_EMAIL' | 'T2_NAME' | 'T3_FUZZY' | 'T4_NEW' | 'SKIPPED';
    facultyId: string | null;
    facultyName: string | null;
    updatedFields: string[];
    reason?: string;
  };
  const results: RowResult[] = [];

  for (const row of rows) {
    const sourceName = String(row.name || '').trim();
    if (!sourceName) {
      results.push({
        sourceName: '', tier: 'SKIPPED', facultyId: null, facultyName: null,
        updatedFields: [], reason: 'Empty name',
      });
      continue;
    }

    const { firstName, lastName } = splitName(sourceName);

    // T1
    let matched = row.email
      ? byEmail.get(String(row.email).trim().toLowerCase()) ?? null
      : null;
    let tier: RowResult['tier'] | null = matched ? 'T1_EMAIL' : null;

    // T2
    if (!matched) {
      matched = byName.get(`${firstName.toLowerCase()}|${lastName.toLowerCase()}`) ?? null;
      if (matched) tier = 'T2_NAME';
    }

    // T3
    if (!matched) {
      matched = allFaculty.find((f) =>
        f.aliases.some((a) => isDnaMatch(a, sourceName, 0.85))
      ) ?? null;
      if (matched) tier = 'T3_FUZZY';
    }

    // Build update payload of fields we can safely set
    const data: any = {};
    const updatedFields: string[] = [];
    if (row.email && row.email.trim()) {
      data.email = row.email.trim();
      updatedFields.push('email');
    }
    if (row.division && row.division.trim()) {
      data.division = row.division.trim();
      updatedFields.push('division');
    }
    if (row.adminTitle && row.adminTitle.trim()) {
      data.adminTitle = row.adminTitle.trim();
      updatedFields.push('adminTitle');
    }
    if (row.pos && row.pos.trim()) {
      data.positionType = row.pos.trim();
      updatedFields.push('positionType');
    }
    if (row.rank && row.rank.trim()) {
      const r = normalizeRank(row.rank);
      if (r) { data.rank = r; updatedFields.push('rank'); }
    }
    if (row.dept && row.dept.trim()) {
      const d = normalizeDept(row.dept);
      if (d) { data.department = d; updatedFields.push('department'); }
      // If department doesn't map cleanly to an enum, we leave it as-is;
      // the dept text could be set in division instead, but that would
      // overwrite a real division so we don't.
    }

    if (matched) {
      // Union degrees & aliases instead of overwriting
      const newDegrees = row.degree
        ? String(row.degree).split(/[,;]/).map((s) => s.trim()).filter(Boolean)
        : [];
      // Push source name into aliases for future T3 fuzzy matching
      try {
        const current = await prisma.faculty.findUnique({
          where: { id: matched.id },
          select: { degrees: true, aliases: true },
        });
        if (current) {
          const mergedDegrees = Array.from(new Set([...current.degrees, ...newDegrees]));
          if (mergedDegrees.length !== current.degrees.length) {
            data.degrees = mergedDegrees;
            updatedFields.push('degrees');
          }
          if (!current.aliases.includes(sourceName) && sourceName) {
            data.aliases = Array.from(new Set([...current.aliases, sourceName]));
            updatedFields.push('aliases');
          }
        }
        if (Object.keys(data).length > 0) {
          await prisma.faculty.update({ where: { id: matched.id }, data });
        }
        results.push({
          sourceName, tier: tier!, facultyId: matched.id,
          facultyName: `${matched.firstName} ${matched.lastName}`,
          updatedFields,
        });
      } catch (err: any) {
        results.push({
          sourceName, tier: 'SKIPPED', facultyId: null, facultyName: null,
          updatedFields: [], reason: err?.message || 'Update failed',
        });
      }
    } else if (createMissing) {
      // T4 — create new profile
      try {
        const slug = `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z0-9.]+/g, '');
        const phantomEmail = (row.email && row.email.trim())
          ? row.email.trim()
          : `phantom_${slug}@pending.com`;
        const created = await prisma.faculty.create({
          data: {
            firstName,
            lastName,
            email: phantomEmail,
            aliases: [sourceName],
            degrees: row.degree
              ? String(row.degree).split(/[,;]/).map((s) => s.trim()).filter(Boolean)
              : [],
            division: data.division || null,
            rank: (data.rank as any) || 'Unknown',
            department: (data.department as any) || 'Other',
            adminTitle: data.adminTitle || null,
            positionType: data.positionType || null,
            status: (row.email && row.email.trim()) ? 'VERIFIED' : 'PENDING_RESOLUTION',
          },
        });
        results.push({
          sourceName, tier: 'T4_NEW', facultyId: created.id,
          facultyName: `${created.firstName} ${created.lastName}`,
          updatedFields: Object.keys(data),
        });
      } catch (err: any) {
        results.push({
          sourceName, tier: 'SKIPPED', facultyId: null, facultyName: null,
          updatedFields: [], reason: err?.message || 'Create failed',
        });
      }
    } else {
      results.push({
        sourceName, tier: 'SKIPPED', facultyId: null, facultyName: null,
        updatedFields: [],
        reason: 'No matching faculty (toggle "Create missing profiles" to import as new).',
      });
    }
  }

  // Summary counts
  const summary = {
    total: rows.length,
    t1Email: results.filter((r) => r.tier === 'T1_EMAIL').length,
    t2Name:  results.filter((r) => r.tier === 'T2_NAME').length,
    t3Fuzzy: results.filter((r) => r.tier === 'T3_FUZZY').length,
    t4New:   results.filter((r) => r.tier === 'T4_NEW').length,
    skipped: results.filter((r) => r.tier === 'SKIPPED').length,
  };

  return NextResponse.json({ ok: true, summary, results });
}
