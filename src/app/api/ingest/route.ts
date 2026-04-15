import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractCanonicalIdentity, isDnaMatch } from '@/lib/heuristics';
import type { DivisionType, AcademicRank, ProfileStatus } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventTitle, eventDate, baseDuration, attendees } = body;

    // 1. Transactional Safeguards
    if (!eventTitle || !eventDate || !attendees || !Array.isArray(attendees)) {
      return NextResponse.json({ error: "Malformed payload." }, { status: 400 });
    }

    // 2. Ghost Session Filter (Methodology Requirement)
    if (attendees.length < 5) {
      return NextResponse.json({ error: "Ghost Session Filter Triggered: Fewer than 5 participants. Inference suspended." }, { status: 406 });
    }

    const event = await prisma.event.create({
      data: {
        title: eventTitle,
        date: new Date(eventDate),
        baseDuration: Number(baseDuration) || 60,
      }
    });

    let recordsCreated = 0;

    // Load active dictionary into memory for DNA string-drift tracking
    const allFacultyProfiles = await prisma.faculty.findMany({
      select: { id: true, email: true, aliases: true, status: true, degrees: true }
    });

    for (const person of attendees) {
      if (!person.name) continue;

      // Extract Sherlock Holmes Context
      const inferred = extractCanonicalIdentity(person.name, person.email, person.duration);

      // Micro-session filter: Block flybys
      if (inferred.duration < 10) continue;

      // Ensure no undefined emails for database uniqueness
      const secureEmail = inferred.email || `phantom_${Math.random().toString(36).substring(7)}@pending.com`;

      let matchedFacultyId: string | null = null;
      let matchedProfile = null;

      // Identity Engine Loop
      // Step A: Exact Email Match (Tier 1 Trust)
      if (inferred.email) {
        matchedProfile = allFacultyProfiles.find(f => f.email === inferred.email);
      }

      // Step B: DNA Sequence Alias Matching (Tier 2 Trust)
      if (!matchedProfile) {
        matchedProfile = allFacultyProfiles.find(f => 
          f.aliases.some(alias => isDnaMatch(alias, person.name, 0.85))
        );
      }

      if (matchedProfile) {
        matchedFacultyId = matchedProfile.id;

        // Active Learning: Grow the Alias and Credentials dictionary
        const newAliases = [...new Set([...matchedProfile.aliases, person.name])];
        const newDegrees = [...new Set([...matchedProfile.degrees, ...inferred.inferredDegrees])];
        
        let newStatus = matchedProfile.status;
        // If they were 'Pending' but just logged in with a certified Howard email, upgrade them!
        if (matchedProfile.status === 'PENDING_RESOLUTION' && inferred.email.includes('howard.edu')) {
          newStatus = 'VERIFIED';
        }

        await prisma.faculty.update({
          where: { id: matchedFacultyId },
          data: {
            aliases: newAliases,
            degrees: newDegrees,
            status: newStatus as ProfileStatus
          }
        });

      } else {
        // Fallback: Generative Phantom Shell (The Purgatory Database)
        const nameParts = inferred.cleanName.split(' ');
        
        // If an email exists, it's a strongly verified new profile. Otherwise, it's pending curation.
        const defaultStatus: ProfileStatus = inferred.email ? 'VERIFIED' : 'PENDING_RESOLUTION';
        
        const newFaculty = await prisma.faculty.create({
          data: {
            firstName: nameParts[0] || 'Unknown',
            lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Unknown',
            email: secureEmail,
            aliases: [person.name],
            degrees: inferred.inferredDegrees,
            division: inferred.inferredDivision as DivisionType,
            rank: inferred.inferredRank as AcademicRank,
            department: 'Other', // Awaiting manual mapping by admin
            status: defaultStatus
          }
        });
        
        matchedFacultyId = newFaculty.id;
        
        // Append to local memory dictionary so subsequent loops matching this phantom succeed!
        allFacultyProfiles.push({
          id: matchedFacultyId,
          email: secureEmail,
          aliases: [person.name],
          status: defaultStatus,
          degrees: inferred.inferredDegrees
        });
      }

      // Final Binding
      await prisma.attendance.upsert({
        where: {
          facultyId_eventId: {
            facultyId: matchedFacultyId,
            eventId: event.id
          }
        },
        update: { durationJoined: inferred.duration },
        create: {
          facultyId: matchedFacultyId,
          eventId: event.id,
          durationJoined: inferred.duration
        }
      });

      recordsCreated++;
    }

    return NextResponse.json({ 
      message: "Deep Write Completed Successfully", 
      eventCreated: event.title,
      recordsVerified: recordsCreated
    }, { status: 200 });

  } catch (error: any) {
    console.error("Ingestion API Failure:", error);
    return NextResponse.json({ error: error.message || "Database connection failure." }, { status: 500 });
  }
}
