const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  const facs = await prisma.faculty.findMany();
  
  const matches = facs.filter(f => f.lastName.toLowerCase().includes("ghosh") || f.firstName.toLowerCase().includes("ghosh"));
  console.log(`Search [Ghosh] in Canonical Roster: `, matches.map(m => `${m.firstName} ${m.lastName} (ID: ${m.id})`));
  
  const data = JSON.parse(fs.readFileSync('src/data/final_payload.json', 'utf8'));
  const dropped = Object.keys(data.person_dates || {}).filter(k => k.toLowerCase().includes("ghosh"));
  
  console.log(`Search [Ghosh] in Dropped Zoom Aliases: `, dropped);
}
main().finally(() => prisma.$disconnect());
