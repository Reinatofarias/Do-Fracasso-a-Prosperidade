import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export function getPrisma() {
  if (globalForPrisma.prisma) return globalForPrisma.prisma

  const connectionString = process.env.RUNTIME_DATABASE_URL || process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('RUNTIME_DATABASE_URL ou DATABASE_URL nao configurada.')
  }

  const adapter = new PrismaPg(
    new Pool({
      connectionString,
    }),
  )

  const prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
  }

  return prisma
}
