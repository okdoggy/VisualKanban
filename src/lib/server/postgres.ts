import { Pool } from "pg";

const DATABASE_URL_ENV = "DATABASE_URL";

const globalForPostgres = globalThis as typeof globalThis & {
  __visualKanbanPgPool?: Pool;
};

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(`Missing ${DATABASE_URL_ENV}. Set it in your environment before using /api/state.`);
    this.name = "MissingDatabaseUrlError";
  }
}

function resolveSslConfig() {
  const sslMode = process.env.PGSSLMODE?.trim().toLowerCase();

  if (!sslMode || sslMode === "disable") {
    return undefined;
  }

  const rejectUnauthorized = process.env.PGSSL_REJECT_UNAUTHORIZED !== "false";
  return { rejectUnauthorized };
}

function readDatabaseUrl() {
  const databaseUrl = process.env[DATABASE_URL_ENV]?.trim();
  if (!databaseUrl) {
    throw new MissingDatabaseUrlError();
  }

  return databaseUrl;
}

export function getPostgresPool() {
  if (globalForPostgres.__visualKanbanPgPool) {
    return globalForPostgres.__visualKanbanPgPool;
  }

  const pool = new Pool({
    connectionString: readDatabaseUrl(),
    ssl: resolveSslConfig(),
    max: process.env.PGPOOL_MAX ? Math.max(1, Number.parseInt(process.env.PGPOOL_MAX, 10) || 10) : 10,
    idleTimeoutMillis: 30_000
  });

  pool.on("error", (error: Error) => {
    console.error("[postgres] Unexpected client error", error);
  });

  globalForPostgres.__visualKanbanPgPool = pool;
  return pool;
}
