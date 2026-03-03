import { randomUUID } from "crypto";
import type { QueryResultRow } from "pg";
import { getPostgresPool } from "@/lib/server/postgres";

const WORKSPACE_FILE_TABLE = "visualkanban_workspace_file";

interface WorkspaceFileRow extends QueryResultRow {
  file_id: string;
  workspace_id: string;
  uploader_id: string;
  file_name: string;
  mime_type: string;
  byte_size: string | number;
  content: Buffer;
  created_at: Date | string;
}

let bootstrapPromise: Promise<void> | null = null;

function parseByteSize(value: WorkspaceFileRow["byte_size"]) {
  const normalized = typeof value === "number" ? value : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error(`Invalid workspace file size: ${String(value)}`);
  }

  return normalized;
}

function parseCreatedAt(value: WorkspaceFileRow["created_at"]) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid workspace file created_at value: ${String(value)}`);
  }

  return parsed.toISOString();
}

export interface StoredWorkspaceFileMetadata {
  fileId: string;
  workspaceId: string;
  uploaderId: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface StoredWorkspaceFile extends StoredWorkspaceFileMetadata {
  content: Buffer;
}

function toWorkspaceFileMetadata(row: WorkspaceFileRow): StoredWorkspaceFileMetadata {
  return {
    fileId: row.file_id,
    workspaceId: row.workspace_id,
    uploaderId: row.uploader_id,
    name: row.file_name,
    mimeType: row.mime_type,
    size: parseByteSize(row.byte_size),
    createdAt: parseCreatedAt(row.created_at)
  };
}

function toWorkspaceFile(row: WorkspaceFileRow): StoredWorkspaceFile {
  return {
    ...toWorkspaceFileMetadata(row),
    content: row.content
  };
}

async function bootstrapWorkspaceFileTable() {
  const pool = getPostgresPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${WORKSPACE_FILE_TABLE} (
      file_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      uploader_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
      content BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS ${WORKSPACE_FILE_TABLE}_workspace_created_idx
      ON ${WORKSPACE_FILE_TABLE} (workspace_id, created_at DESC)
  `);
}

async function ensureBootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapWorkspaceFileTable().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  await bootstrapPromise;
}

export interface CreateWorkspaceFileInput {
  workspaceId: string;
  uploaderId: string;
  name: string;
  mimeType: string;
  content: Buffer;
}

export async function createWorkspaceFile(input: CreateWorkspaceFileInput): Promise<StoredWorkspaceFileMetadata> {
  await ensureBootstrap();

  const pool = getPostgresPool();
  const fileId = `file-${randomUUID()}`;

  const result = await pool.query<WorkspaceFileRow>(
    `
      INSERT INTO ${WORKSPACE_FILE_TABLE}
        (file_id, workspace_id, uploader_id, file_name, mime_type, byte_size, content)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING file_id, workspace_id, uploader_id, file_name, mime_type, byte_size, created_at, content
    `,
    [fileId, input.workspaceId, input.uploaderId, input.name, input.mimeType, input.content.byteLength, input.content]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to insert workspace file.");
  }

  return toWorkspaceFileMetadata(row);
}

export async function readWorkspaceFile(fileId: string): Promise<StoredWorkspaceFile | null> {
  await ensureBootstrap();

  const pool = getPostgresPool();
  const result = await pool.query<WorkspaceFileRow>(
    `
      SELECT file_id, workspace_id, uploader_id, file_name, mime_type, byte_size, created_at, content
      FROM ${WORKSPACE_FILE_TABLE}
      WHERE file_id = $1
      LIMIT 1
    `,
    [fileId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return toWorkspaceFile(row);
}
