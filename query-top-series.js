const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const series = await prisma.eventSeries.findMany({
      include: {
          events: { 
              include: { _count: { select: { attendances: true } } },
              orderBy: { attendances: { _count: 'desc' } },
              take: 1
          }
      }
  });
  
  for (const s of series) {
      const topEvent = s.events[0];
      console.log(`Series: ${s.title}`);
      if (topEvent) {
          console.log(`  - Top Event: ${topEvent.title} (${topEvent._count.attendances} attendees)`);
      }
  }
}
main().finally(() => prisma.$disconnect());
