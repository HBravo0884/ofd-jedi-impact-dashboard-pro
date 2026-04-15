import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';
import { extractCanonicalIdentity } from '@/lib/heuristics';
import type { DivisionType, AcademicRank, ProfileStatus } from '@prisma/client';
import legacyDataRaw from '@/data/final_payload.json';

export async function GET() {
  try {
    const legacyData: any = legacyDataRaw;

    // 0. Ensure Idempotency (Prevent Duplicate Cloud Syncs)
    await prisma.attendance.deleteMany({});
    await prisma.event.deleteMany({});

    const directory = legacyData.table;
    let recordsSeeded = 0;
    
    // 2. Iterate the highly scrutinized baseline directory
    for (const profile of directory) {
       const email = profile.email || `legacy_${Math.random().toString(36).substring(7)}@pending.com`;
       
       const inferred = extractCanonicalIdentity(profile.name, email, 0);

       const fallbackStatus: ProfileStatus = 'VERIFIED';
       
       // Force manual extraction of degrees
       if (profile.degree && !inferred.inferredDegrees.includes(profile.degree)) {
         inferred.inferredDegrees.push(profile.degree);
       }

       const faculty = await prisma.faculty.upsert({
         where: { email: email.toLowerCase() },
         update: {},
         create: {
           firstName: inferred.cleanName.split(' ')[0] || 'Unknown',
           lastName: inferred.cleanName.split(' ').slice(1).join(' ') || 'Unknown',
           email: email.toLowerCase(),
           aliases: [profile.name],
           status: fallbackStatus,
           degrees: inferred.inferredDegrees,
           division: inferred.inferredDivision as DivisionType,
           rank: inferred.inferredRank as AcademicRank,
           department: 'Other'
         }
       });

       recordsSeeded++;
    }

    // 3. SEED EVENT SERIES & EVENTS
    const sessions = legacyData.sessions || [];
    let eventsSeeded = 0;
    const eventIdMap: Record<string, string> = {}; // Mapping label -> DB event id

    for (const session of sessions) {
      // Create or locate the Series
      const seriesTitle = session.series || "Uncategorized Series";
      const seriesRecord = await prisma.eventSeries.upsert({
        where: { title: seriesTitle },
        update: {},
        create: { title: seriesTitle }
      });

      // Create the explicit Event
      const eventTitle = session.topic || session.label || "Unknown Event";
      const evt = await prisma.event.create({
        data: {
          title: eventTitle,
          date: new Date(session.date_str || new Date()),
          baseDuration: session.n || 60,
          seriesId: seriesRecord.id
        }
      });
      eventIdMap[session.label] = evt.id;
      eventsSeeded++;
    }

    // 4. SEED ATTENDANCE RECORDS
    const personDates = legacyData.person_dates || {};
    let attendanceSeeded = 0;

    for (const rawName of Object.keys(personDates)) {
      const fakeEmail = `legacy_${Math.random().toString(36).substring(7)}@pending.com`;
      const inferred = extractCanonicalIdentity(rawName, fakeEmail, 0);
      
      const personRecord = await prisma.faculty.findFirst({
        where: {
          OR: [
            { aliases: { has: rawName } },
            { firstName: inferred.cleanName.split(' ')[0], lastName: inferred.cleanName.split(' ').slice(1).join(' ') }
          ]
        }
      });

      if (!personRecord) continue;

      const sessionsArray = personDates[rawName];
      for (const historyRecord of sessionsArray) {
         // Query by title (which mapped to topic/label)
         const targetEvent = await prisma.event.findFirst({
           where: { title: historyRecord.topic }
         });

         if (targetEvent) {
           await prisma.attendance.upsert({
             where: {
               facultyId_eventId: {
                 facultyId: personRecord.id,
                 eventId: targetEvent.id
               }
             },
             update: {},
             create: {
               facultyId: personRecord.id,
               eventId: targetEvent.id,
               durationJoined: historyRecord.duration || 60
             }
           });
           attendanceSeeded++;
         }
      }
    }

    return NextResponse.json({ 
      message: "Total Baseline Knowledge Re-Synchronized Successfully.",
      recordsSeeded: recordsSeeded,
      eventsSeeded: eventsSeeded,
      attendanceSeeded: attendanceSeeded
    }, { status: 200 });

  } catch (error: any) {
    console.error("Hydration Failure:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
