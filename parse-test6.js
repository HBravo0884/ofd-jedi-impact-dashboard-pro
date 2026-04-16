const fs = require('fs');
const data = JSON.parse(fs.readFileSync('../OFD/Examples Impact Dashboard Demo/final_payload.json', 'utf8'));
console.log("person_series keys:", Object.keys(data.person_series).slice(0, 3));
if (Object.keys(data.person_series).length > 0) {
  const firstP = Object.keys(data.person_series)[0];
  console.log("First person series map:", firstP, data.person_series[firstP]);
}
console.log("person_dates type:", Array.isArray(data.person_dates), "length", data.person_dates ? data.person_dates.length : 0);
if(Array.isArray(data.person_dates) && data.person_dates.length > 0) {
  console.log("person_dates 0:", data.person_dates[0]);
} else if (Object.keys(data.person_dates || {}).length > 0) {
  const firstP = Object.keys(data.person_dates)[0];
  console.log("First person date map:", firstP, data.person_dates[firstP]);
}
