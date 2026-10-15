import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/** Lazy singleton — avoids crashing the serverless process at import time. */
export const prisma = globalForPrisma.prisma ?? createClient();
globalForPrisma.prisma = prisma;
