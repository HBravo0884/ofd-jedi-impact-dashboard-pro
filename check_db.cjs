const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  console.log('Faculty:', await prisma.faculty.count());
  console.log('Events:', await prisma.event.count());
  console.log('Attendance:', await prisma.attendance.count());
}
main().finally(() => prisma.$disconnect());
