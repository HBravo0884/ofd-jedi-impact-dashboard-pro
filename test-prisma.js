const { PrismaClient } = require('@prisma/client');
try {
  const p = new PrismaClient();
  console.log("Success instantiating PrismaClient in bare Node.js");
} catch(e) {
  console.log("Failed:", e.message);
}
