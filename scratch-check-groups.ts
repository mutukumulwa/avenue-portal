import 'dotenv/config'
import { prisma } from './src/lib/prisma'

async function main() {
  const tenant = await prisma.tenant.findFirst()
  const groups = await prisma.group.findMany({ select: { id: true, name: true } })
  const snapshots = await prisma.analyticsMlrSnapshot.findMany({
    where: { grain: 'SCHEME', period: '2026-05' },
    orderBy: { mlr: 'desc' }
  })
  
  const groupMap = new Map(groups.map(g => [g.id, g.name]))
  for (const snap of snapshots) {
    console.log(`${groupMap.get(snap.groupId || '')}: MLR ${(Number(snap.mlr)*100).toFixed(1)}%`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
