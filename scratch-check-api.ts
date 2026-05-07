import 'dotenv/config'
import { prisma } from './src/lib/prisma'

async function main() {
  const tenant = await prisma.tenant.findFirst()
  console.log('Tenant:', tenant.id)
  
  const user = await prisma.user.findFirst({ where: { email: 'admin@avenue.co.ke' } })
  console.log('User:', user?.id, 'Tenant:', user?.tenantId)
  
  const snapshots = await prisma.analyticsMlrSnapshot.findMany({
    where: { tenantId: user?.tenantId }
  })
  console.log('Snapshots for tenant:', snapshots.length)

  const latestPortfolio = await prisma.analyticsMlrSnapshot.findFirst({
    where: { tenantId: user?.tenantId, grain: 'PORTFOLIO' },
    orderBy: { period: 'desc' }
  })
  console.log('Latest portfolio:', latestPortfolio)
}

main().catch(console.error).finally(() => prisma.$disconnect())
