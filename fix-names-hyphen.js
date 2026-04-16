const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const facs = await prisma.faculty.findMany();
  
  // 1. Fix Marjorie's Name
  const marj = facs.find(f => f.firstName.includes("Marjorie") || f.lastName.includes("Gondre") || f.lastName.includes("Gondré"));
  if (marj) {
      await prisma.faculty.update({
          where: { id: marj.id },
          data: { firstName: "Marjorie C.", lastName: "Gondré-Lewis" }
      });
      console.log(`Updated: ${marj.firstName} ${marj.lastName} -> Marjorie C. Gondré-Lewis`);
  }

  // 2. Fix hyphenated capitalizations globally!
  for (const f of facs) {
      let changed = false;
      let newFirst = f.firstName;
      let newLast = f.lastName;
      
      if (newFirst.includes('-')) {
          newFirst = newFirst.replace(/-([a-z])/g, (g) => g[0] + g[1].toUpperCase());
          if (newFirst !== f.firstName) changed = true;
      }
      if (newLast.includes('-')) {
          newLast = newLast.replace(/-([a-z])/g, (g) => g[0] + g[1].toUpperCase());
          if (newLast !== f.lastName) changed = true;
      }
      
      if (changed) {
          await prisma.faculty.update({
              where: { id: f.id },
              data: { firstName: newFirst, lastName: newLast }
          });
          console.log(`Capitalized Hyphen: ${f.firstName} ${f.lastName} -> ${newFirst} ${newLast}`);
      }
  }
}
main().finally(() => prisma.$disconnect());
