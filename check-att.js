const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const atnd = await prisma.attendance.count();
  console.log("Total Attendance in DB:", atnd);
}
main().catch(console.error).finally(() => prisma.$disconnect());
