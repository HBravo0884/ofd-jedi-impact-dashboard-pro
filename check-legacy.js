const fs = require('fs');
const data = JSON.parse(fs.readFileSync('src/data/final_payload.json', 'utf8'));

let totalAtt = 0;
for (const p of Object.keys(data.person_dates || {})) {
   totalAtt += data.person_dates[p].length;
}
console.log("Total Legacy Attendance Records in JSON:", totalAtt);
console.log("Total People keys in person_dates:", Object.keys(data.person_dates || {}).length);
