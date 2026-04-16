const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const others = await prisma.faculty.findMany({
    where: { department: 'Other' },
    select: { division: true, email: true, firstName: true }
  });
  console.log(`Found ${others.length} Others.`);
  
  const divCounts = {};
  others.forEach(o => {
      let d = o.division || 'NULL';
      divCounts[d] = (divCounts[d] || 0) + 1;
  });
  
  const sorted = Object.entries(divCounts).sort((a,b)=>b[1]-a[1]).slice(0, 20);
  console.log("Top divisions causing 'Other':");
  sorted.forEach(c => console.log(`${c[0]} -> ${c[1]}`));
}
main().finally(() => prisma.$disconnect());
