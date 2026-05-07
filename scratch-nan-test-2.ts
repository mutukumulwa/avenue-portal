import { Prisma } from '@prisma/client'

const claims = [
  { approvedAmount: new Prisma.Decimal(1650000) },
  { approvedAmount: new Prisma.Decimal(400000) },
  { approvedAmount: new Prisma.Decimal(7500) },
  { approvedAmount: new Prisma.Decimal(20000) },
]
const sum = claims.reduce((s, c) => s + (c as unknown as { approvedAmount: number }).approvedAmount, 0)
console.log('sum:', sum)
console.log('runningBalance:', 32000000 - (sum as any))
