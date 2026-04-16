const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const mapping = {
  "Andrea Hayes Dixon": "Hayes-dixon",
  "Benita King# Com Center For Innovation": "Benita King",
  "Carla Willia/Howard Univ": "Carla Willia",
  "Daniel Larbi69749583": "Daniel Larbi",
  "Drose": "David Rose",
  "Emily": "Emily Lawson",
  "Fati Barnes": "Fatima Barnes",
  "Hashktorab": "Hassan Ashktorab",
  "Kalavenkiteswaran": "Kala Venkiteswaran",
  "Lila \"Lela\" Hurst Brooks": "Lila Hurst Brooks"
};

async function main() {
  for (const [droppedAlias, searchName] of Object.entries(mapping)) {
     const facs = await prisma.faculty.findMany({
        where: { OR: [ { firstName: { contains: searchName.split(' ')[0] }, lastName: { contains: searchName.split(' ')[1] || searchName } } ] }
     });
     
     if (facs.length > 0) {
        // Just update the first valid match to keep it simple
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
