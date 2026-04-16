const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  const facs = await prisma.faculty.findMany();
  console.log(`Total canonical faculty: ${facs.length}`);
  
  const search = [
     "Hayes", "King", "Willia", "Larbi", "Rose", "Emily", "Barnes", "Ashktorab", "Venk", "Hurst"
  ];
  
  for (const s of search) {
     const matches = facs.filter(f => f.lastName.toLowerCase().includes(s.toLowerCase()) || f.firstName.toLowerCase().includes(s.toLowerCase()));
     console.log(`Search [${s}]: => `, matches.map(m => `${m.firstName} ${m.lastName}`));
  }
}
main().finally(() => prisma.$disconnect());
