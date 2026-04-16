const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const houston = await prisma.faculty.findFirst({
      where: { firstName: "Patricia", lastName: "Houston" }
  });
  if (houston) {
      const newAliases = [...new Set([...houston.aliases, "Patty"])];
      await prisma.faculty.update({
          where: { id: houston.id },
          data: { aliases: newAliases }
      });
      console.log(`Successfully mapped 'Patty' -> ${houston.firstName} ${houston.lastName}`);
  }
}
main().finally(() => prisma.$disconnect());
