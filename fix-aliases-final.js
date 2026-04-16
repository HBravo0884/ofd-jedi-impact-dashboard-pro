const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Applying User Corrections and Final Aliases...");

  // 1. Correct "Patricia Coleman" to "Pamela Coleman"
  const coleman = await prisma.faculty.findFirst({ where: { lastName: "Coleman", firstName: "Patricia" } });
  if (coleman) {
      await prisma.faculty.update({ where: { id: coleman.id }, data: { firstName: "Pamela" } });
      console.log("Corrected Patricia Coleman -> Pamela Coleman");
  }

  // 2. Correct "Lynn Mckinley-grant" to "Linn McKinley-Grant"
  const mckinley = await prisma.faculty.findFirst({ where: { lastName: "Mckinley-grant" } });
  if (mckinley) {
      await prisma.faculty.update({ where: { id: mckinley.id }, data: { firstName: "Linn", lastName: "McKinley-Grant" } });
      console.log("Corrected Lynn Mckinley-grant -> Linn McKinley-Grant");
  }

  // 3. Map the 6 remaining aliases:
  const mappings = [
    { alias: "Andrea Hayes Dixon", targetFirst: "Andrea", targetLast: "Hayes" },
    { alias: "Lynnmckinley Grant", targetFirst: "Linn", targetLast: "McKinley-Grant" },
    { alias: "Tiffany Willia", targetFirst: "Tiffany", targetLast: "Williams" },
    { alias: "Veronica", targetFirst: "Veronica", targetLast: "Bruce" },
    { alias: "Ymkanaan", targetFirst: "Yasmine", targetLast: "Kanaan" },
    { alias: "Patty", targetFirst: "Patricia", targetLast: "Houston" }
  ];

  for (const map of mappings) {
     const facs = await prisma.faculty.findMany({
        where: { firstName: { contains: map.targetFirst }, lastName: { contains: map.targetLast.split("-")[0] } }
     });
     
     if (facs.length > 0) {
        const target = facs[0];
        const newAliases = [...new Set([...target.aliases, map.alias])];
        await prisma.faculty.update({
          where: { id: target.id },
          data: { aliases: newAliases }
        });
        console.log(`Mapped alias [${map.alias}] -> ${target.firstName} ${target.lastName}`);
     } else {
        console.log(`Failed to map [${map.alias}] -> ${map.targetFirst} ${map.targetLast} (Not Found)`);
     }
  }
}
main().finally(() => prisma.$disconnect());
