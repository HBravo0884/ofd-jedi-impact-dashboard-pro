const fs = require('fs');
const data = JSON.parse(fs.readFileSync('src/data/final_payload.json', 'utf8'));

const carla = Object.keys(data.person_dates || {}).filter(k => k.toLowerCase().includes("carla") || k.toLowerCase().includes("davis"));
console.log("Raw aliases containing Carla or Davis:", carla);
