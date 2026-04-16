const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();
const { extractCanonicalIdentity } = require('./src/lib/heuristics.ts') || function(){}; 

// Let's just run the seed natively here to bypass Netlify's 10-second limit!
async function main() {
  const data = JSON.parse(fs.readFileSync('src/data/final_payload.json', 'utf8'));
  console.log("Seeding Events...");
  
  for (const session of data.sessions || []) {
      const seriesTitle = session.series || "Uncategorized Series";
      const seriesRecord = await prisma.eventSeries.upsert({ where: { title: seriesTitle }, update: {}, create: { title: seriesTitle } });
      const eventTitle = session.topic || session.label || "Unknown Event";
      try {
        await prisma.event.create({
          data: {
            title: eventTitle,
            date: new Date(session.date_str || new Date()),
            baseDuration: session.n || 60,
            seriesId: seriesRecord.id
          }
        });
      } catch(e) {} // Avoid dupes if already seeded in previous partial run
  }
  
  console.log("Seeding Attendance (Bypassing 10s Cloud Timeout)...");
  let count = 0;
  for (const rawName of Object.keys(data.person_dates || {})) {
      // Basic find faculty (assuming 268 already successfully seeded):
      const personRecord = await prisma.faculty.findFirst({
        where: { OR: [{ aliases: { has: rawName } }] }
      });
      if (!personRecord) continue;
      
      const sessionsArray = data.person_dates[rawName];
      for (const historyRecord of sessionsArray) {
         const targetEvent = await prisma.event.findFirst({ where: { title: historyRecord.topic } });
         if (targetEvent) {
           await prisma.attendance.upsert({
             where: { facultyId_eventId: { facultyId: personRecord.id, eventId: targetEvent.id } },
             update: {},
             create: { facultyId: personRecord.id, eventId: targetEvent.id, durationJoined: historyRecord.duration || 60 }
           });
           count++;
         }
      }
  }
  console.log(`FULLY FINISHED: ${count} total attendance records synced.`);
}
main().finally(()=>prisma.$disconnect());
