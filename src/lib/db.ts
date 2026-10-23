import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Resolve DATABASE_URL ("file:./prisma/dev.db", "file:/data/agentboard.db") to a file path */
function resolveDbPath() {
  const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
  return path.resolve(process.cwd(), url.replace(/^file:/, ""));
}

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({ url: resolveDbPath() });
  return new PrismaClient({ adapter });
}

// Always cache on globalThis: instrumentation and route handlers are separate
// bundles in production and must share one client.
export const prisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = prisma;
