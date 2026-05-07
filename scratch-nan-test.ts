import { Prisma } from '@prisma/client'

const d = new Prisma.Decimal(20000)
const sum = 0 + (d as unknown as number)
console.log('sum:', sum)
console.log('runningBalance:', 32000000 - sum)
