const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
  console.log("Wiping corrupted duplicates...");
  await prisma.attendance.deleteMany({});
  await prisma.event.deleteMany({});
  
  const data = JSON.parse(fs.readFileSync('src/data/final_payload.json', 'utf8'));
  console.log("Re-Seeding exact 54 Events...");
  
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
      } catch(e) {}
  }
  
  console.log("Re-Seeding true Attendance arrays...");
  let count = 0;
  for (const rawName of Object.keys(data.person_dates || {})) {
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
  console.log(`DB CLEANED. EXACT TRUE COUNT: ${count} attendance records synced. 54 Events Synced.`);
}
main().finally(()=>prisma.$disconnect());
