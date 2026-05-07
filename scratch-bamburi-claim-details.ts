import 'dotenv/config'
import { prisma } from './src/lib/prisma'

async function main() {
  const claims = await prisma.claim.findMany({
    where: { claimNumber: { startsWith: 'CLM-AN-BAM-202605' } },
    orderBy: { claimNumber: 'asc' }
  })
  for (const c of claims) {
    console.log(`${c.claimNumber}: ${c.approvedAmount}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
