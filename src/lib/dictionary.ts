import { AcademicRank, DepartmentType } from '@prisma/client';

/**
 * Maps raw roles/ranks into the core 5 Academic Ranks or Staff/Student.
 */
export function mapRank(raw: string): AcademicRank {
  if (!raw) return 'Unknown';
  const s = raw.toLowerCase();

  // Faculty
  if (s.includes('assistant') && s.includes('professor')) return 'AssistantProfessor';
  if (s.includes('associate') && s.includes('professor')) return 'AssociateProfessor';
  if (s.includes('professor')) return 'Professor';
  if (s.includes('instructor')) return 'Instructor';
  if (s.includes('dean')) return 'Dean';
  if (s.includes('chair')) return 'Chair';
  if (s.includes('faculty')) return 'Faculty';

  // Non-Faculty
  if (s.includes('student')) return 'Student';

  // Administrators / Assistants / Managers / Directors
  if (
    s.includes('manager') ||
    s.includes('coordinator') ||
    s.includes('admin') ||
    s.includes('assistant') ||
    s.includes('director') ||
    s.includes('advocate') ||
    s.includes('analyst') ||
    s.includes('staff')
  ) {
    return 'Staff';
  }

  return 'Unknown';
}

/**
 * Aggregates micro-divisions into core Departments.
 */
export function mapDepartment(rawDept: string, rawDiv: string): DepartmentType {
  if (!rawDept) rawDept = '';
  if (!rawDiv) rawDiv = '';
  const t = (rawDept + ' ' + rawDiv).toLowerCase();

  // Internal Medicine Macro-bucket
  if (
    t.includes('medicine') ||
    t.includes('gastroenterology') ||
    t.includes('pulmonary') ||
    t.includes('endocrinology') ||
    t.includes('cardiology') ||
    t.includes('rheumatology') ||
    t.includes('nephrology') ||
    t.includes('infectious disease')
  ) {
    return 'Medicine';
  }

  // Oncology Macro-bucket (Represented via RadiationOncology for now)
  if (t.includes('oncology') || t.includes('cancer')) {
    return 'RadiationOncology';
  }

  // Surgery Macro-bucket
  if (
    t.includes('surgery') ||
    t.includes('trauma') ||
    t.includes('foot and ankle') ||
    t.includes('colon & rectal')
  ) {
    return 'Surgery';
  }

  // Pediatrics Macro-bucket
  if (t.includes('peds') || t.includes('pediatric') || t.includes('neonatology')) {
    return 'Pediatrics';
  }

  // Pathology Macro-bucket
  if (t.includes('pathology') || t.includes('cytopathology') || t.includes('autopsy')) {
    return 'Pathology';
  }

  // Ob/Gyn Macro-Bucket
  if (
    t.includes('gynecology') ||
    t.includes('urogynecology') ||
    t.includes('obstetrics') ||
    t.includes('mammography')
  ) {
    return 'ObstetricsGynecology';
  }

  // Clean Passthroughs
  if (t.includes('anatomy')) return 'Anatomy';
  if (t.includes('dermatology')) return 'Dermatology';
  if (t.includes('neurology')) return 'Neurology';
  if (t.includes('psychiatry')) return 'Psychiatry';
  if (t.includes('radiology') || t.includes('body imaging')) return 'Radiology';
  if (t.includes('pharmacology')) return 'Pharmacology';
  if (t.includes('physiology')) return 'Physiology';
  if (t.includes('microbiology')) return 'Microbiology';
  if (t.includes('biochemistry')) return 'Biochemistry';
  if (t.includes('community') && t.includes('family')) return 'CommunityFamilyMedicine';

  // Administration Core
  if (
    t.includes('dean') ||
    t.includes('faculty development') ||
    t.includes('curriculum') ||
    t.includes('research') ||
    t.includes('finance') ||
    t.includes('innovation') ||
    t.includes('compliance') ||
    t.includes('operations') ||
    t.includes('hr') ||
    t.includes('human resources')
  ) {
    return 'Administration';
  }

  // Students - explicit category mapping
  if (t.includes('student')) return 'Student';
  
  if (t.includes('medical education')) return 'MedicalEducation';

  return 'Other';
}

/**
 * Derives the exact high-fidelity Event Name. 
 * If a known override string exists for the Date+Topic combo, returns it.
 * Otherwise falls back to formatting the Date and Topic cleanly to ensure uniqueness.
 */
export function getEventTitle(dateStr: string, topic: string): string {
  if (!topic) topic = "Uncategorized Event";
  
  // SWAT Subject Line Overrides
  if (dateStr === "2025-06-19" && topic.includes("SWAT")) return "SWAT 2025: WEEK 1 - Get Ready for SWAT";
  if (dateStr === "2025-06-26" && topic.includes("SWAT")) return "SWAT 2025: Week 2 - Writing Journey";
  if (dateStr === "2025-07-02" && topic.includes("SWAT")) return "SWAT 2025: Week 3 - Writing Journey";
  if (dateStr === "2025-07-10" && topic.includes("SWAT")) return "SWAT 2025: Week 4 - Writing Journey";
  if (dateStr === "2025-07-17" && topic.includes("SWAT")) return "SWAT 2025: Week 5 - Writing Journey";
  if (dateStr === "2025-07-23" && topic.includes("SWAT")) return "SWAT 2025: Week 6 - Writing Journey";
  if (dateStr === "2025-07-30" && topic.includes("SWAT")) return "SWAT 2025: Week 7 - Leadership Development";

  // All of Us Overrides
  if (dateStr === "2025-08-11" && topic.includes("All of Us")) return '"All of Us" Training: Session 1';
  if (dateStr === "2025-08-13" && topic.includes("All of Us")) return '"All of Us" Workbench Pre-Session';
  if (dateStr === "2025-08-15" && topic.includes("All of Us")) return '"All of Us" Training: Session 3';
  if (dateStr === "2025-08-08" && topic.includes("All of Us")) return '"All of Us" Pre-Session: Registration Process';

  // Fallback to exact date combination to securely prevent overwrite collisions
  return `${dateStr} · ${topic}`;
}
