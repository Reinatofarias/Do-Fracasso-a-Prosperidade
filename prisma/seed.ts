import bcrypt from 'bcryptjs'
import { getPrisma } from '../server/db'

const prisma = getPrisma()

const users = [
  {
    name: process.env.SEED_USER_1_NAME || 'Usuario Principal',
    email: (process.env.SEED_USER_1_EMAIL || 'voce@prosperidade.local').toLowerCase(),
    password: process.env.SEED_USER_1_PASSWORD || 'prosperidade123',
    role: 'OWNER' as const,
  },
  {
    name: process.env.SEED_USER_2_NAME || 'Esposa',
    email: (process.env.SEED_USER_2_EMAIL || 'esposa@prosperidade.local').toLowerCase(),
    password: process.env.SEED_USER_2_PASSWORD || 'prosperidade123',
    role: 'SPOUSE' as const,
  },
]

async function main() {
  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role },
      create: {
        name: user.name,
        email: user.email,
        role: user.role,
        passwordHash: await bcrypt.hash(user.password, 12),
      },
    })
  }

  const personal = await prisma.profile.upsert({
    where: { id: 'personal-default' },
    update: {},
    create: { id: 'personal-default', name: 'Familia', type: 'PERSONAL' },
  })

  const business = await prisma.profile.upsert({
    where: { id: 'business-default' },
    update: {},
    create: { id: 'business-default', name: 'Empresa', type: 'BUSINESS' },
  })

  for (const profile of [personal, business]) {
    await prisma.account.upsert({
      where: { id: `${profile.id}-main-account` },
      update: {},
      create: {
        id: `${profile.id}-main-account`,
        profileId: profile.id,
        name: profile.type === 'PERSONAL' ? 'Conta principal' : 'Caixa empresarial',
        type: 'CHECKING',
      },
    })

    const defaults = [
      ['Receitas', 'INCOME', '#2f9e44'],
      ['Moradia', 'EXPENSE', '#d4af37'],
      ['Alimentacao', 'EXPENSE', '#52b788'],
      ['Transporte', 'EXPENSE', '#f59f00'],
      ['Dividas', 'EXPENSE', '#ef4444'],
    ] as const

    for (const [name, type, color] of defaults) {
      await prisma.category.upsert({
        where: { id: `${profile.id}-${name.toLowerCase()}` },
        update: {},
        create: { id: `${profile.id}-${name.toLowerCase()}`, profileId: profile.id, name, type, color },
      })
    }
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect()
  })
