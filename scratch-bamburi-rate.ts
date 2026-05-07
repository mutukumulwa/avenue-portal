import 'dotenv/config'
import { prisma } from './src/lib/prisma'

async function main() {
  const bamburi = await prisma.group.findFirst({ where: { name: 'Bamburi Cement' } })
  console.log(`Bamburi contrib rate: ${bamburi.contributionRate}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
