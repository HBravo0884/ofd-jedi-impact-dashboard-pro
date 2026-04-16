const fs = require('fs');
const data = JSON.parse(fs.readFileSync('../OFD/Examples Impact Dashboard Demo/final_payload.json', 'utf8'));
console.log("scatter_people length: ", data.scatter_people.length);
console.log("table length: ", data.table.length);
