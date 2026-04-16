const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  const data = JSON.parse(fs.readFileSync('src/data/final_payload.json', 'utf8'));
  const facs = await prisma.faculty.findMany();
  
  let droppedAliases = [];
  
  // Find all keys in person_dates that do NOT match any canonical faculty alias array
  for (const rawName of Object.keys(data.person_dates || {})) {
      const match = facs.find(f => f.aliases.includes(rawName));
      if (!match) {
         droppedAliases.push(rawName);
      }
  }
  
  console.log(`Remaining Unmapped Aliases (${droppedAliases.length}):`);
  
  // Try to computationally guess their identities based on substring overlaps
  for (const alias of droppedAliases) {
     const tokens = alias.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(t => t.length > 2);
     let guessed = [];
     
     for (const f of facs) {
         const fName = (f.firstName + " " + f.lastName).toLowerCase();
         // simple heuristic: does the canonical name contain ANY of the tokens in the alias?
         if (tokens.some(t => fName.includes(t))) {
             guessed.push(`${f.firstName} ${f.lastName}`);
         }
     }
     
     console.log(`\nAlias: "${alias}"`);
     if (guessed.length > 0 && guessed.length < 5) {
         console.log(`   --> Potential Matches: ${guessed.join('  OR  ')}`);
     } else if (guessed.length >= 5) {
         console.log(`   --> Too ambiguous to guess (${guessed.length} loose matches)`);
     } else {
         console.log(`   --> No obvious matches found.`);
     }
  }
}
main().finally(() => prisma.$disconnect());
