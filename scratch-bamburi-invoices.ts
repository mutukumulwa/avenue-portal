import 'dotenv/config'
import { prisma } from './src/lib/prisma'

async function main() {
  const bamburi = await prisma.group.findFirst({ where: { name: 'Bamburi Cement' } })
  const invoices = await prisma.invoice.findMany({
    where: { groupId: bamburi.id }
  })
  for (const inv of invoices) {
    console.log(`Invoice: ${inv.invoiceNumber}, Period: ${inv.period}, Total: ${inv.totalAmount}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
