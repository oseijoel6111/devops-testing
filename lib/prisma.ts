import { PrismaClient } from "@prisma/client";

declare const globalThis: {
  prismaGlobal: PrismaClient | undefined;
} & typeof global;

/** Set PRISMA_TIMING=1 to print every query's duration (use SLOW_QUERY_MS to only show slow ones). */
const timingEnabled = process.env.PRISMA_TIMING === "1";

function createClient() {
  if (!timingEnabled) return new PrismaClient();

  const client = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  const slowMs = Number(process.env.SLOW_QUERY_MS ?? 0);
  client.$on("query", (e) => {
    if (e.duration < slowMs) return;
    console.log(`[prisma] ${e.duration}ms ${e.query.replace(/\s+/g, " ").slice(0, 140)}`);
  });
  return client;
}

const prisma = (globalThis.prismaGlobal ?? createClient()) as PrismaClient;

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}

export default prisma;
