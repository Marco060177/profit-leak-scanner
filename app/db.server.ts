import { PrismaClient } from "@prisma/client";

function warnIfProductionSqlitePathLooksEphemeral() {
  if (process.env.NODE_ENV !== "production") return;

  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl.toLowerCase().startsWith("file:")) return;

  const sqlitePath = databaseUrl.slice("file:".length).split("?")[0];
  const normalizedPath = sqlitePath.replace(/\\/g, "/").toLowerCase();
  const looksEphemeral =
    !normalizedPath.startsWith("/") ||
    normalizedPath.startsWith("/app/") ||
    normalizedPath.startsWith("/tmp/");

  if (looksEphemeral) {
    console.warn(
      "[DATABASE] Production SQLite path may be ephemeral. Configure DATABASE_URL to use the mounted Render Persistent Disk path.",
    );
  }
}

warnIfProductionSqlitePathLooksEphemeral();

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;
