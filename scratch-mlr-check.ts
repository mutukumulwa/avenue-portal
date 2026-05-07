import 'dotenv/config'
import { prisma } from './src/lib/prisma'

async function main() {
  const snapshots = await prisma.analyticsMlrSnapshot.findMany({
    where: { grain: 'PORTFOLIO' }
  })
  
  for (const s of snapshots.slice(0, 5)) {
    console.log(`Period: ${s.period}, MLR: ${s.mlr}, Claims: ${s.benefitPaid}, Contrib: ${s.grossContribution}`)
  }

  const latest = snapshots.reduce((latest, current) => {
    return latest.period > current.period ? latest : current
  }, snapshots[0])

  console.log('Latest portfolio snapshot:', latest)
}

main().catch(console.error).finally(() => prisma.$disconnect())
