const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const mapping = {
  "M D Daniel Larbi": "Daniel Larbi",
  "M D Danielle Hairston": "Danielle Hairston",
  "Ph D Tywanda Mclaurin Jones": "Tywanda Mclaurin",
  "Sayannandi": "Sayan Nandi",
  "Nosimotbuhari": "Nosimot Buhari",
  "Nosimot Adenike Buhari": "Nosimot Buhari",
  "Lynnmckinley Grant": "Lynn McKinley"
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
