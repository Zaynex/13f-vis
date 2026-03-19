// Prisma Client Singleton
//
// In development, Next.js hot-reloads modules. Without a singleton,
// multiple PrismaClient instances would be created, causing connection
// pool exhaustion. This pattern ensures only one instance exists.

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
