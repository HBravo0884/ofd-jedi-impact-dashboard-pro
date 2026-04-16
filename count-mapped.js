const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const data = JSON.parse(fs.readFileSync('src/data/final_payload.json', 'utf8'));
    const totalRawZoomNames = Object.keys(data.person_dates || {}).length;
    
    const facs = await prisma.faculty.findMany();
    
    let successfullyMapped = 0;
    let failedToMap = [];
    
    for (const rawName of Object.keys(data.person_dates || {})) {
        const match = facs.find(f => f.aliases.includes(rawName));
        if (match) {
            successfullyMapped++;
        } else {
            failedToMap.push(rawName);
        }
    }
    
    console.log(`\n\n[AUDIT RESULTS]`);
    console.log(`-----------------------------------------------`);
    console.log(`Original Zoom Legacy Payload: ${totalRawZoomNames} unique string proxies.`);
    console.log(`Successfully mapped to DB:    ${successfullyMapped} profiles.`);
    console.log(`Failed to map (Dropped):      ${failedToMap.length} profiles.`);
    if (failedToMap.length > 0) {
        console.log(`\nRemaining Dropped Names: \n${failedToMap.join('\n')}`);
    }
    console.log(`-----------------------------------------------`);
}
main().finally(() => prisma.$disconnect());
