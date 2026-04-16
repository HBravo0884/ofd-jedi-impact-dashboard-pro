const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const [attendanceRes, facultyRes, eventRes, uncatRes, facultyArray, deptGroup, seriesArray] = await Promise.all([
    prisma.attendance.aggregate({ _sum: { durationJoined: true }, _count: true }),
    prisma.faculty.count({ where: { status: 'VERIFIED' } }),
    prisma.event.count(),
    prisma.faculty.count({ where: { status: 'PENDING_RESOLUTION' } }),
    prisma.faculty.findMany({ where: { status: 'VERIFIED' }, include: { _count: { select: { attendances: true } } } }),
    prisma.faculty.groupBy({ by: ['department'], _count: { department: true }, orderBy: { _count: { department: 'desc' } } }),
    prisma.eventSeries.findMany({ include: { events: { include: { attendances: { select: { facultyId: true } } } } } })
  ]);

  console.log("== RAW KPI ==");
  console.log("Total Attendance Records:", attendanceRes._count);
  console.log("Unique Participants (Verified):", facultyRes);
  console.log("Total Sessions:", eventRes);
  
  console.log("\n== DEPARTMENTS ==");
  deptGroup.forEach(d => console.log(`${d.department}: ${d._count.department}`));

  console.log("\n== SERIES REACH ==");
  seriesArray.forEach(s => {
    let localAttendances = 0;
    let uniqueFaculties = new Set();
    s.events.forEach(e => {
        localAttendances += e.attendances.length;
        e.attendances.forEach(a => uniqueFaculties.add(a.facultyId));
    });
    console.log(`${s.title} -> Avg: ${s.events.length > 0 ? Math.round(localAttendances/s.events.length) : 0}, Unique Reach: ${uniqueFaculties.size}`);
  });
}
main().finally(() => prisma.$disconnect());
