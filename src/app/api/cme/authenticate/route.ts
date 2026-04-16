import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  extractPath, 
  normalizePoints, 
  resamplePoints, 
  dynamicTimeWarping, 
  calculateConfidence 
} from '@/lib/signatureML';

export async function POST(req: Request) {
  try {
    const { name, eventId, signatureTrace } = await req.json();

    if (!name || name.length < 3) {
      return NextResponse.json({ error: 'Valid printed name is required.' }, { status: 400 });
    }

    // 1. Locate Identity (graceful fallback to First/Last Name matching if needed)
    let faculty = await prisma.faculty.findFirst({
      where: { 
        OR: [
          { email: name.toLowerCase() },
          { firstName: { contains: name.split(' ')[0], mode: 'insensitive' } }
        ]
      }
    });

    // If completely unknown, create a Pending guest identity to preserve audit trail
    if (!faculty) {
      faculty = await prisma.faculty.create({
        data: {
          firstName: name.split(' ')[0] || "Unknown",
          lastName: name.split(' ').slice(1).join(' ') || "Guest",
          email: `${name.replace(/\s+/g, '.').toLowerCase()}@guest.hu.edu`,
          status: 'PENDING_RESOLUTION',
          department: 'Other',
          rank: 'Unknown'
        }
      });
    }

    // 2. Perform Biometric Match if Traces Exist
    let mlScore = -1; // -1 means Baseline Override (No history)
    
    // Parse historical strokes from previous Kiosk check-ins safely stored as stringified JSON in the DB
    const historicalTraces = faculty.signatureUrls
         .map(urlStr => {
             try { return JSON.parse(urlStr); } catch { return null; }
         })
         .filter(Boolean);

    if (signatureTrace && signatureTrace.length > 0) {
      const currentPoints = resamplePoints(normalizePoints(extractPath(signatureTrace)), 50);

      if (historicalTraces.length > 0) {
        let bestDtw = Infinity;
        for (const historyData of historicalTraces) {
            const histPoints = resamplePoints(normalizePoints(extractPath(historyData)), 50);
            const score = dynamicTimeWarping(histPoints, currentPoints);
            if (score < bestDtw) bestDtw = score;
        }
        mlScore = calculateConfidence(bestDtw, 50);
      }

      // Add to their baseline (Save payload into array)
      await prisma.faculty.update({
        where: { id: faculty.id },
        data: {
          signatureUrls: { push: JSON.stringify(signatureTrace).substring(0, 5000) } // Cap size
        }
      });
    }

    // 3. Log Attendance officially
    if (eventId) {
       // Check if already attended
       const existing = await prisma.attendance.findUnique({
          where: { facultyId_eventId: { facultyId: faculty.id, eventId } }
       });
       if (!existing) {
          await prisma.attendance.create({
             data: {
                 facultyId: faculty.id,
                 eventId: eventId,
                 durationJoined: 60 // Hardcoded for 1 AMA PRA Credit™ check-in baseline
             }
          });
       }
    }

    return NextResponse.json({
      success: true,
      identity: faculty.id,
      ml_confidence: mlScore,
      action: mlScore === -1 ? 'BASELINE_ACQUIRED' : (mlScore > 75 ? 'VERIFIED' : 'SUSPICIOUS_MAPPED')
    }, { status: 200 });

  } catch (err: any) {
    console.error("CME Biometric Endpoint Failure:", err);
    return NextResponse.json({ error: 'Registration framework failure.' }, { status: 500 });
  }
}
