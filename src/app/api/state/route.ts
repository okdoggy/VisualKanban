import { NextRequest, NextResponse } from "next/server";
import { MissingDatabaseUrlError } from "@/lib/server/postgres";
import { authorizeWorkspaceStateMutation } from "@/lib/server/state/workspace-state-authorization";
import { readWorkspaceSnapshot, writeWorkspaceSnapshot } from "@/lib/server/state/workspace-state-repository";
import { parseWorkspaceId, sanitizeSharedWorkspaceState } from "@/lib/state/shared-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store"
};

interface ParsedPutBody {
  workspaceId: string;
  expectedVersion: number;
  state: ReturnType<typeof sanitizeSharedWorkspaceState>;
}

function badRequest(message: string) {
  return NextResponse.json(
    {
      ok: false,
      error: message
    },
    {
      status: 400,
      headers: NO_STORE_HEADERS
    }
  );
}

function internalErrorResponse(error: unknown) {
  const message = error instanceof MissingDatabaseUrlError ? error.message : "Failed to load shared workspace state.";

  if (!(error instanceof MissingDatabaseUrlError)) {
    console.error("[api/state] request failed", error);
  }

  return NextResponse.json(
    {
      ok: false,
      error: message
    },
    {
      status: 500,
      headers: NO_STORE_HEADERS
    }
  );
}

function parseExpectedVersion(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : null;
}

function parsePutBody(payload: unknown): ParsedPutBody | { error: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: "Request body must be a JSON object." };
  }

  const body = payload as Record<string, unknown>;
  const workspaceId = parseWorkspaceId(body.workspaceId);
  if (!workspaceId) {
    return { error: "workspaceId must contain only letters, numbers, dot, underscore, or dash." };
  }

  const expectedVersion = parseExpectedVersion(body.expectedVersion);
  if (expectedVersion === null) {
    return { error: "expectedVersion must be a non-negative integer." };
  }

  if (!("state" in body) || body.state === undefined) {
    return { error: "state is required." };
  }

  return {
    workspaceId,
    expectedVersion,
    state: sanitizeSharedWorkspaceState(body.state)
  };
}

export async function GET(request: NextRequest) {
  const workspaceId = parseWorkspaceId(request.nextUrl.searchParams.get("workspaceId"));
  if (!workspaceId) {
    return badRequest("workspaceId must contain only letters, numbers, dot, underscore, or dash.");
  }

  try {
    const snapshot = await readWorkspaceSnapshot(workspaceId);

    return NextResponse.json(
      {
        ok: true,
        workspaceId: snapshot.workspaceId,
        version: snapshot.version,
        state: snapshot.state
      },
      {
        headers: NO_STORE_HEADERS
      }
    );
  } catch (error) {
    return internalErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  const actorUserId = request.cookies.get("vk_user")?.value?.trim();
  if (!actorUserId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Authentication is required."
      },
      {
        status: 401,
        headers: NO_STORE_HEADERS
      }
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = parsePutBody(payload);
  if ("error" in parsed) {
    return badRequest(parsed.error);
  }

  try {
    const currentSnapshot = await readWorkspaceSnapshot(parsed.workspaceId);
    const authorization = authorizeWorkspaceStateMutation({
      actorUserId,
      currentState: currentSnapshot.state,
      nextState: parsed.state
    });

    if (!authorization.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: authorization.reason
        },
        {
          status: 403,
          headers: NO_STORE_HEADERS
        }
      );
    }

    const result = await writeWorkspaceSnapshot(parsed);

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          reason: "VERSION_CONFLICT",
          workspaceId: result.snapshot.workspaceId,
          version: result.snapshot.version,
          state: result.snapshot.state
        },
        {
          status: 409,
          headers: NO_STORE_HEADERS
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        workspaceId: result.snapshot.workspaceId,
        version: result.snapshot.version,
        state: result.snapshot.state
      },
      {
        headers: NO_STORE_HEADERS
      }
    );
  } catch (error) {
    return internalErrorResponse(error);
  }
}
