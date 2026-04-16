const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const count = await prisma.faculty.count();
  console.log("TOTAL FACULTY IN SUPABASE:", count);
}
main().catch(console.error).finally(() => prisma.$disconnect());
