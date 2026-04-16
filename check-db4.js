const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const atnd = await prisma.attendance.count();
  const evt = await prisma.event.count();
  console.log({ events: evt, attendance: atnd });
}
main().catch(console.error).finally(() => prisma.$disconnect());
