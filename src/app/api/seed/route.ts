import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';
import { extractCanonicalIdentity } from '@/lib/heuristics';
import type { DivisionType, AcademicRank, ProfileStatus, EventSeries, EventType } from '@prisma/client';

export async function GET() {
  try {
    // 1. Locate the highly-scrutinized Phase 1 JSON File natively within the React Server Map
    const payloadPath = path.join(process.cwd(), 'src/data/final_payload.json');
    
    if (!fs.existsSync(payloadPath)) {
      return NextResponse.json({ error: "Legacy payload not found." }, { status: 404 });
    }

    const fileContent = fs.readFileSync(payloadPath, 'utf8');
    const legacyData = JSON.parse(fileContent);

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

    // 3. SEED EVENTS
    const sessions = legacyData.sessions || [];
    let eventsSeeded = 0;
    const eventIdMap: Record<string, string> = {}; // Mapping label -> DB event id

    for (const session of sessions) {
      let mappedSeries: EventSeries = 'Other';
      const sLower = session.series.toLowerCase();
      if (sLower.includes('dean')) mappedSeries = 'DeansDynamicDuo';
      else if (sLower.includes('faculty tools')) mappedSeries = 'FacultyTools';
      else if (sLower.includes('fundamentals')) mappedSeries = 'Fundamentals';
      else if (sLower.includes('jedi') || sLower.includes('diversity')) mappedSeries = 'JEDI';
      else if (sLower.includes('writing')) mappedSeries = 'WritingWorkshop';

      let mappedType: EventType = 'Workshop';
      if (sLower.includes('dean') || sLower.includes('lecture')) mappedType = 'Lecture';
      
      const evt = await prisma.event.create({
        data: {
          topic: session.topic || session.label,
          desc: session.desc || "",
          type: mappedType,
          series: mappedSeries,
          date: new Date(session.date_str)
        }
      });
      eventIdMap[session.label] = evt.id;
      eventsSeeded++;
    }

    // 4. SEED ATTENDANCE RECORDS
    const personDates = legacyData.person_dates || {};
    let attendanceSeeded = 0;

    for (const rawName of Object.keys(personDates)) {
      // Re-run the Heuristics Engine to perfectly trace their Email ID to lookup the Faculty record
      // We use a fake email since this is historic data matching
      const fakeEmail = `legacy_${Math.random().toString(36).substring(7)}@pending.com`;
      const inferred = extractCanonicalIdentity(rawName, fakeEmail, 0);
      
      // Look up Faculty by their canonical first and last name match or alias
      const personRecord = await prisma.faculty.findFirst({
        where: {
          OR: [
            { aliases: { has: rawName } },
            { firstName: inferred.cleanName.split(' ')[0], lastName: inferred.cleanName.split(' ').slice(1).join(' ') }
          ]
        }
      });

      if (!personRecord) continue;

      // Extract Array of their sessions
      const sessionsArray = personDates[rawName];
      for (const historyRecord of sessionsArray) {
         // Create the Event Label to hook against our Event Map
         // Usually format in Phase 1 was like: "Mar 19·Dean's Dynamic Duo Lecture Series"
         // Wait, the Phase 1 arrays have a strict "topic" and "date" we can query.
         const targetEvent = await prisma.event.findFirst({
           where: { topic: historyRecord.topic }
         });

         if (targetEvent) {
           await prisma.attendance.create({
             data: {
               facultyId: personRecord.id,
               eventId: targetEvent.id,
               duration: historyRecord.duration || 60
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
