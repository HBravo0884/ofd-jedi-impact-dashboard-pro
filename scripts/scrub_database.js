const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function capitalizeWords(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/(?:^|\s|-|')\S/g, (match) => match.toUpperCase());
}

async function run() {
  console.log("=========================================");
  console.log("   HUCM DATABASE NORMALIZATION SCRUB     ");
  console.log("=========================================");

  try {
    const faculties = await prisma.faculty.findMany();
    let updatedCount = 0;

    for (const fac of faculties) {
      let fName = capitalizeWords(fac.firstName);
      let lName = capitalizeWords(fac.lastName);

      // Edge cases for "McDonald", "O'Connor"
      lName = lName.replace(/Mac([a-z])/g, (m, p1) => `Mac${p1.toUpperCase()}`);
      lName = lName.replace(/Mc([a-z])/g, (m, p1) => `Mc${p1.toUpperCase()}`);
      
      if (fName !== fac.firstName || lName !== fac.lastName) {
         try {
           await prisma.faculty.update({
             where: { id: fac.id },
             data: { firstName: fName, lastName: lName }
           });
           console.log(`[Normalized] ${fac.firstName} ${fac.lastName} -> ${fName} ${lName}`);
           updatedCount++;
         } catch(e) {
           console.error("Duplicate key or DB constraint error for:", fName, lName);
         }
      }
    }

    console.log(`\n✅ Normalization Complete. Corrected ${updatedCount} profiles.`);
  } catch (err) {
    console.error("Scrubbing Failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
