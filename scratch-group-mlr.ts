import 'dotenv/config'
import { prisma } from './src/lib/prisma'

async function main() {
  const groups = await prisma.group.findMany()
  for (const group of groups) {
    const snapshots = await prisma.analyticsMlrSnapshot.findMany({
      where: { grain: 'SCHEME', groupId: group.id },
      orderBy: { period: 'desc' },
      take: 1
    })
    if (snapshots.length > 0) {
      const s = snapshots[0]
      console.log(`Group: ${group.name}, Period: ${s.period}`)
      console.log(`  Contrib: ${s.grossContribution}`)
      console.log(`  Claims Paid: ${s.benefitPaid}`)
      console.log(`  MLR: ${s.mlr}`)
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
