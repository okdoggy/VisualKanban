import type { QueryResultRow } from "pg";
import { getPostgresPool } from "@/lib/server/postgres";
import {
  createSeedSharedWorkspaceState,
  deserializeSharedWorkspaceState,
  serializeSharedWorkspaceState,
  type SharedWorkspaceSnapshot,
  type SharedWorkspaceState
} from "@/lib/state/shared-snapshot";

const WORKSPACE_STATE_TABLE = "visualkanban_workspace_state";

interface WorkspaceStateRow extends QueryResultRow {
  workspace_id: string;
  version: string | number;
  state: unknown;
}

let bootstrapPromise: Promise<void> | null = null;

function parseVersion(value: WorkspaceStateRow["version"]) {
  const normalized = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new Error(`Invalid workspace state version: ${String(value)}`);
  }

  return normalized;
}

function toWorkspaceSnapshot(row: WorkspaceStateRow): SharedWorkspaceSnapshot {
  return {
    workspaceId: row.workspace_id,
    version: parseVersion(row.version),
    state: deserializeSharedWorkspaceState(row.state)
  };
}

async function bootstrapWorkspaceStateTable() {
  const pool = getPostgresPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${WORKSPACE_STATE_TABLE} (
      workspace_id TEXT PRIMARY KEY,
      version BIGINT NOT NULL CHECK (version >= 1),
      state JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureBootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapWorkspaceStateTable().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  await bootstrapPromise;
}

async function readWorkspaceSnapshotRow(workspaceId: string): Promise<WorkspaceStateRow | null> {
  const pool = getPostgresPool();
  const result = await pool.query<WorkspaceStateRow>(
    `
      SELECT workspace_id, version, state
      FROM ${WORKSPACE_STATE_TABLE}
      WHERE workspace_id = $1
      LIMIT 1
    `,
    [workspaceId]
  );

  return result.rows[0] ?? null;
}

async function insertDefaultWorkspaceState(workspaceId: string) {
  const pool = getPostgresPool();
  const defaultState = createSeedSharedWorkspaceState();

  await pool.query(
    `
      INSERT INTO ${WORKSPACE_STATE_TABLE} (workspace_id, version, state)
      VALUES ($1, 1, $2::jsonb)
      ON CONFLICT (workspace_id) DO NOTHING
    `,
    [workspaceId, serializeSharedWorkspaceState(defaultState)]
  );
}

export async function readWorkspaceSnapshot(workspaceId: string): Promise<SharedWorkspaceSnapshot> {
  await ensureBootstrap();

  const row = await readWorkspaceSnapshotRow(workspaceId);
  if (row) {
    return toWorkspaceSnapshot(row);
  }

  await insertDefaultWorkspaceState(workspaceId);

  const insertedRow = await readWorkspaceSnapshotRow(workspaceId);
  if (!insertedRow) {
    throw new Error(`Workspace state row missing after bootstrap insert: ${workspaceId}`);
  }

  return toWorkspaceSnapshot(insertedRow);
}

export interface WriteWorkspaceSnapshotInput {
  workspaceId: string;
  expectedVersion: number;
  state: SharedWorkspaceState;
}

export type WriteWorkspaceSnapshotResult =
  | {
      ok: true;
      snapshot: SharedWorkspaceSnapshot;
    }
  | {
      ok: false;
      snapshot: SharedWorkspaceSnapshot;
    };

export async function writeWorkspaceSnapshot(input: WriteWorkspaceSnapshotInput): Promise<WriteWorkspaceSnapshotResult> {
  await ensureBootstrap();
  await insertDefaultWorkspaceState(input.workspaceId);

  const pool = getPostgresPool();
  const nextState = serializeSharedWorkspaceState(input.state);

  const updateResult = await pool.query<WorkspaceStateRow>(
    `
      UPDATE ${WORKSPACE_STATE_TABLE}
      SET
        version = version + 1,
        state = $3::jsonb,
        updated_at = NOW()
      WHERE workspace_id = $1 AND version = $2
      RETURNING workspace_id, version, state
    `,
    [input.workspaceId, input.expectedVersion, nextState]
  );

  if (updateResult.rowCount && updateResult.rows[0]) {
    return {
      ok: true,
      snapshot: toWorkspaceSnapshot(updateResult.rows[0])
    };
  }

  return {
    ok: false,
    snapshot: await readWorkspaceSnapshot(input.workspaceId)
  };
}
