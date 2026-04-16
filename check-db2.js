const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const verifiedCount = await prisma.faculty.count({ where: { status: 'VERIFIED' }});
  const pendingCount = await prisma.faculty.count({ where: { status: 'PENDING_RESOLUTION' }});
  const ranksCount = (await prisma.faculty.groupBy({ by: ['rank'], _count: { rank: true } })).length;
  console.log({verifiedCount, pendingCount, ranksCount});
}
main().catch(console.error).finally(() => prisma.$disconnect());
