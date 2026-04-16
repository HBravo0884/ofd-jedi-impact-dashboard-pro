const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('../OFD/Examples Impact Dashboard Demo/final_payload.json', 'utf8'));
console.log("Keys in payload:", Object.keys(data).length);
console.log("Root Keys:", Object.keys(data).slice(0, 5));
if (data.nodes) {
  console.log("Nodes length:", data.nodes.length);
}
