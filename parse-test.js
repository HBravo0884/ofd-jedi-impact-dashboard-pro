const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('../OFD/Examples Impact Dashboard Demo/final_payload.json', 'utf8'));
console.log("Total entries in final_payload.json:", data.length);
