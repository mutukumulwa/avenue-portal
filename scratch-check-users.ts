import 'dotenv/config'
import { prisma } from './src/lib/prisma'

async function main() {
  const users = await prisma.user.findMany({ where: { role: 'MEMBER_USER' } })
  console.log('MEMBER_USERs:', users.map(u => ({ email: u.email, memberId: u.memberId })))

  const demoMembers = await prisma.member.findMany({
    orderBy: [{ groupId: 'asc' }, { memberNumber: 'asc' }],
    take: 5,
    select: { id: true, memberNumber: true }
  })
  console.log('Top 5 members:', demoMembers)
}

main().catch(console.error).finally(() => prisma.$disconnect())
