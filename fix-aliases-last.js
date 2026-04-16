const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const mappings = [
    { alias: "Noor Malik Abdullah", targetFirst: "Noor", targetLast: "Malik" },
    { alias: "Thyagarajan Subramanian \"Sub\", Cpe Chair Of Neurology", targetFirst: "Thyagarajan", targetLast: "Subramanian" }
  ];
  for (const map of mappings) {
     const facs = await prisma.faculty.findMany({
        where: { firstName: { contains: map.targetFirst }, lastName: { contains: map.targetLast } }
     });
     if (facs.length > 0) {
        const target = facs[0];
        const newAliases = [...new Set([...target.aliases, map.alias])];
        await prisma.faculty.update({
          where: { id: target.id }, data: { aliases: newAliases }
        });
        console.log(`Mapped alias [${map.alias}] -> ${target.firstName} ${target.lastName}`);
     }
  }
}
main().finally(() => prisma.$disconnect());
