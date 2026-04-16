const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const facs = await prisma.faculty.findMany();
  
  console.log("Kanaan:", facs.filter(f => f.lastName.toLowerCase().includes("kanaan")).map(f => f.firstName + " " + f.lastName));
  console.log("Subramanian:", facs.filter(f => f.lastName.toLowerCase().includes("subramanian")).map(f => f.firstName + " " + f.lastName));
  console.log("Mckinley:", facs.filter(f => f.lastName.toLowerCase().includes("mckinley")).map(f => f.firstName + " " + f.lastName));
  console.log("Patty:", facs.filter(f => f.firstName.toLowerCase().includes("pat")).map(f => f.firstName + " " + f.lastName));
}
main().finally(() => prisma.$disconnect());
