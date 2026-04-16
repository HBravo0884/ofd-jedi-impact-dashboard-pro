const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
  const data = JSON.parse(fs.readFileSync('src/data/final_payload.json', 'utf8'));
  let dropped = [];
  
  for (const rawName of Object.keys(data.person_dates || {})) {
      const personRecord = await prisma.faculty.findFirst({
        where: { OR: [{ aliases: { has: rawName } }] }
      });
      if (!personRecord) {
         dropped.push({ name: rawName, counts: data.person_dates[rawName].length });
      }
  }
  console.log("Dropped faculty:", dropped.slice(0, 10));
  const droppedAtt = dropped.reduce((sum, d) => sum + d.counts, 0);
  console.log(`Total Dropped Faculty: ${dropped.length}`);
  console.log(`Total Dropped Attendances: ${droppedAtt}`);
}
main().catch(console.error).finally(()=>prisma.$disconnect());
