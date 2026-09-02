import { PrismaClient } from "@prisma/client";

// Ensure DATABASE_URL fallback for clean architecture & zero-config startup
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "file:./data/deploynest.db";
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
