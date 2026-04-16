const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const series = await prisma.eventSeries.findMany({
      include: {
          events: { include: { _count: { select: { attendances: true } } } }
      }
  });
  
  for (const s of series) {
      const totalEvents = s.events.length;
      const totalAttendances = s.events.reduce((sum, e) => sum + e._count.attendances, 0);
      console.log(`Series: ${s.title}`);
      console.log(`  - Events: ${totalEvents}`);
      console.log(`  - Total Attendances: ${totalAttendances}`);
  }
}
main().finally(() => prisma.$disconnect());
