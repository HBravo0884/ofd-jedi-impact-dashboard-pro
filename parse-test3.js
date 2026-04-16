const fs = require('fs');
const data = JSON.parse(fs.readFileSync('../OFD/Examples Impact Dashboard Demo/final_payload.json', 'utf8'));
console.log(Object.keys(data));
