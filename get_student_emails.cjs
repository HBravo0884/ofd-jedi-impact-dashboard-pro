const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const others = await prisma.faculty.findMany({
    where: { department: 'Other' },
    select: { email: true }
  });
  
  let bisonCount = 0;
  let howardCount = 0;
  let gmailCount = 0;
  let dummyCount = 0;
  let otherDist = {};

  others.forEach(o => {
      const email = o.email.toLowerCase();
      if (email.includes('@bison.howard.edu')) bisonCount++;
      else if (email.includes('@howard.edu')) howardCount++;
      else if (email.includes('@gmail.com')) gmailCount++;
      else if (email.includes('legacy_')) dummyCount++;
      else {
         const domain = email.split('@')[1];
         otherDist[domain] = (otherDist[domain] || 0) + 1;
      }
  });

  console.log(`Bison (Students): ${bisonCount}`);
  console.log(`Howard.edu: ${howardCount}`);
  console.log(`Gmail: ${gmailCount}`);
  console.log(`Dummy Legacy: ${dummyCount}`);
  console.log('Other Domains:', otherDist);
}
main().finally(() => prisma.$disconnect());
