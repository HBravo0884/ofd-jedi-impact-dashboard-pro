const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const simpleParser = require('mailparser').simpleParser;

const prisma = new PrismaClient();
const EM_DIR = '/Users/entreprneuros/Downloads/Email threads ';

function getESTDateStrings(isoDate) {
  const d = new Date(isoDate);
  const d2 = new Date(d.getTime() - 86400000);
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  const f1 = formatter.format(d);
  const f2 = formatter.format(d2);
  return [f1, f1.replace(',', ''), f2, f2.replace(',', '')];
}

async function run() {
  console.log("Loading EML files...");
  const fileNames = fs.readdirSync(EM_DIR).filter(f => f.endsWith('.eml'));
  
  // Pre-fetch all events that need mapping
  const events = await prisma.event.findMany({ select: { id: true, title: true, date: true } });
  
  let successCount = 0;
  
  console.log(`Checking ${events.length} events against ${fileNames.length} emails...`);

  for (const e of events) {
    const dates = getESTDateStrings(e.date);
    let seriesParts = e.title.split('·');
    let seriesName = seriesParts.length > 1 ? seriesParts[1].trim() : e.title;
    
    // Narrow filter heuristic to speed up MailParser parsing
    let shortSeries = seriesName.includes('Dynamic Duo') ? 'Dynamic Duo' : 
                      seriesName.includes('Biweekly') ? 'Biweekly' : 
                      seriesName.includes('Writing') ? 'WAG' : seriesName;

    // Fast-pass regex on RAW files to narrow down which files to full-parse
    const candidateFiles = fileNames.filter(f => f.includes(shortSeries) || dates.some(d => f.includes(d)));
    
    let bestMatch = null;

    for (const f of candidateFiles) {
       const raw = fs.readFileSync(path.join(EM_DIR, f), 'utf-8');
       // Double check raw text explicitly contains date if the filename doesn't
       if (!dates.some(d => f.includes(d)) && !dates.some(d => raw.includes(d))) continue;

       const parsed = await simpleParser(raw);
       const text = parsed.text || parsed.html || '';
       const subject = parsed.subject || '';

       let topic = null;
       let speaker = null;

       // Extraction Heuristics for Topic
       const quotedTopic = text.match(/Series\s*-\s*["“]([^"”]+)["”]/i);
       if (quotedTopic) topic = quotedTopic[1].trim();
       else if (text.match(/Topic:\s*([^\n\r<]+)/i)) topic = text.match(/Topic:\s*([^\n\r<]+)/i)[1].trim();
       else {
          topic = subject.replace(/Undeliverable- /gi,'').replace(/FW: /gi,'').trim();
       }

       // Extraction Heuristics for Speaker
       const presMatch = text.match(/presented on.*?by\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+)/i);
       if (presMatch) speaker = presMatch[1].trim();
       else if (text.match(/Speaker:\s*([^\n\r<]+)/i)) speaker = text.match(/Speaker:\s*([^\n\r<]+)/i)[1].trim();
       else if (text.match(/Guest:\s*([^\n\r<]+)/i)) speaker = text.match(/Guest:\s*([^\n\r<]+)/i)[1].trim();
       
       if (topic) {
          bestMatch = { topic, speaker: speaker || 'Unknown', file: f };
          break; // Stop looking for emails for this event
       }
    }
    
    if (bestMatch) {
       await prisma.event.update({
          where: { id: e.id },
          data: { topic: bestMatch.topic.substring(0,250), speaker: bestMatch.speaker.substring(0,100) }
       });
       console.log(`[+] Mapped ${e.title}`);
       console.log(`     Topic: ${bestMatch.topic.substring(0,80)}`);
       console.log(`     Speaker: ${bestMatch.speaker}`);
       successCount++;
    } else {
       console.log(`[-] Failed to map: ${e.title}`);
    }
  }
  
  console.log(`\n✔️ Successfully mapped ${successCount} out of ${events.length} events!`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
