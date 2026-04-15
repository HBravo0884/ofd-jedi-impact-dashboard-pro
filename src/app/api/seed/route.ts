import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';
import { extractCanonicalIdentity } from '@/lib/heuristics';
import type { DivisionType, AcademicRank, ProfileStatus } from '@prisma/client';

export async function GET() {
  try {
    // 1. Locate the highly-scrutinized Phase 1 JSON File
    const payloadPath = path.resolve('/Users/entreprneuros/Library/CloudStorage/OneDrive-SharedLibraries-HowardUniversity/Faculty Corner HUCM - OFD Impact Dashboard/OFD/Examples Impact Dashboard Demo/final_payload.json');
    
    if (!fs.existsSync(payloadPath)) {
      return NextResponse.json({ error: "Legacy payload not found." }, { status: 404 });
    }

    const fileContent = fs.readFileSync(payloadPath, 'utf8');
    const legacyData = JSON.parse(fileContent);

    const directory = legacyData.table;
    let recordsSeeded = 0;
    
    // 2. Iterate the highly scrutinized baseline directory
    for (const profile of directory) {
       const email = profile.email || `legacy_${Math.random().toString(36).substring(7)}@pending.com`;
       
       const inferred = extractCanonicalIdentity(profile.name, email, 0);

       const fallbackStatus: ProfileStatus = 'VERIFIED';
       
       // Force manual extraction of degrees
       if (profile.degree && !inferred.inferredDegrees.includes(profile.degree)) {
         inferred.inferredDegrees.push(profile.degree);
       }

       const faculty = await prisma.faculty.upsert({
         where: { email: email.toLowerCase() },
         update: {},
         create: {
           firstName: inferred.cleanName.split(' ')[0] || 'Unknown',
           lastName: inferred.cleanName.split(' ').slice(1).join(' ') || 'Unknown',
           email: email.toLowerCase(),
           aliases: [profile.name],
           status: fallbackStatus,
           degrees: inferred.inferredDegrees,
           division: inferred.inferredDivision as DivisionType,
           rank: inferred.inferredRank as AcademicRank,
           department: 'Other'
         }
       });

       recordsSeeded++;
    }

    return NextResponse.json({ 
      message: "Baseline Knowledge Sourced Successfully.",
      recordsSeeded: recordsSeeded
    }, { status: 200 });

  } catch (error: any) {
    console.error("Hydration Failure:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
