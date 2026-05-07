import 'dotenv/config'
import { prisma } from './src/lib/prisma'

async function main() {
  const demoGroups = await prisma.group.findMany({
    where: {
      name: { in: ['Safaricom PLC', 'KCB Group', 'East African Breweries', 'Bamburi Cement', 'Twiga Foods'] },
    },
    include: {
      members: { where: { status: 'ACTIVE' }, select: { id: true } }
    }
  })

  for (const group of demoGroups) {
    const memberCount = group.members.length
    const annualRatePerMember = Number(group.contributionRate)
    const monthlyRatePerMember = Math.round(annualRatePerMember / 12)
    const monthlyContribution = memberCount * monthlyRatePerMember
    console.log(`Group: ${group.name}, Members: ${memberCount}, Rate: ${annualRatePerMember}, MonthlyRate: ${monthlyRatePerMember}, MonthlyContrib: ${monthlyContribution}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
