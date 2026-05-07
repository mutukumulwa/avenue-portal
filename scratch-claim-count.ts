import 'dotenv/config'
import { prisma } from './src/lib/prisma'

async function main() {
  const count = await prisma.claim.count()
  console.log('Total claims:', count)
}

main().catch(console.error).finally(() => prisma.$disconnect())
