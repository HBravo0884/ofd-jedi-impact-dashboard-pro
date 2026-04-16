const fs = require('fs');
const data = JSON.parse(fs.readFileSync('src/data/final_payload.json', 'utf8'));

const clinic = Object.keys(data.person_dates || {}).filter(k => k.toLowerCase().includes("family") || k.toLowerCase().includes("faith"));
console.log("Raw aliases containing Family or Faith:", clinic);
