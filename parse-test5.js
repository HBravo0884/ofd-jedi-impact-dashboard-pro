const fs = require('fs');
const data = JSON.parse(fs.readFileSync('../OFD/Examples Impact Dashboard Demo/final_payload.json', 'utf8'));
console.log("Sessions length:", data.sessions ? data.sessions.length : 'none');
if (data.sessions && data.sessions.length > 0) {
  console.log("Session 0:", data.sessions[0]);
}
if (data.scatter_people && data.scatter_people.length > 0) {
  console.log("Scatter 0:", data.scatter_people[0]);
}
