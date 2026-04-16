const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const facs = await prisma.faculty.findMany({
    where: { OR: [ { firstName: { contains: "Carla" } }, { lastName: { contains: "Davis" } } ] }
  });
  console.log("Canonical Matches for Carla or Davis:", facs.map(m => `${m.firstName} ${m.lastName}`));
}
main().finally(() => prisma.$disconnect());
