const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const mapping = {
  "Ghosh": "Ghosh Unknown",
  "Somiranjan Ghosh": "Ghosh Unknown"
};

async function main() {
  for (const [droppedAlias, searchName] of Object.entries(mapping)) {
     const facs = await prisma.faculty.findMany({
        where: { OR: [ { firstName: { contains: searchName.split(' ')[0] }, lastName: { contains: searchName.split(' ')[1] || searchName } } ] }
     });
     
     if (facs.length > 0) {
        const target = facs[0];
        const newAliases = [...new Set([...target.aliases, droppedAlias])];
        await prisma.faculty.update({
          where: { id: target.id },
          data: { aliases: newAliases }
        });
        console.log(`Successfully mapped dropped [${droppedAlias}] into canonical -> ${target.firstName} ${target.lastName}`);
     }
  }
}
main().finally(() => prisma.$disconnect());
