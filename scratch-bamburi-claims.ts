import 'dotenv/config'
import { prisma } from './src/lib/prisma'

async function main() {
  const bamburi = await prisma.group.findFirst({ where: { name: 'Bamburi Cement' } })
  const facts = await prisma.analyticsEncounterFact.findMany({
    where: { groupId: bamburi.id },
    orderBy: { encounterDate: 'desc' },
    take: 15
  })
  for (const f of facts) {
    console.log(`Date: ${f.encounterDate}, BenefitPaid: ${f.benefitPaid}, Status: ${f.status}, sourceKey: ${f.sourceKey}, Provider: ${f.providerId}, Icd: ${f.icdFamily}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
