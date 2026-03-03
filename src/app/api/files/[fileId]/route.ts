import { NextRequest, NextResponse } from "next/server";
import { canSeeTask, resolveRole } from "@/lib/permissions/roles";
import { MissingDatabaseUrlError } from "@/lib/server/postgres";
import { readWorkspaceFile } from "@/lib/server/state/file-repository";
import { readWorkspaceSnapshot } from "@/lib/server/state/workspace-state-repository";
import type { Task, User } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store"
};

function parseFileId(rawFileId: string | undefined) {
  if (typeof rawFileId !== "string") {
    return null;
  }

  const normalized = rawFileId.trim();
  if (!normalized || normalized.length > 200) {
    return null;
  }

  return normalized;
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

function unauthorized() {
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

function forbidden() {
  return NextResponse.json(
    {
      ok: false,
      error: "You do not have access to this file."
    },
    {
      status: 403,
      headers: NO_STORE_HEADERS
    }
  );
}

function notFound() {
  return NextResponse.json(
    {
      ok: false,
      error: "File not found."
    },
    {
      status: 404,
      headers: NO_STORE_HEADERS
    }
  );
}

function internalErrorResponse(error: unknown) {
  const message = error instanceof MissingDatabaseUrlError ? error.message : "Failed to read attachment file.";

  if (!(error instanceof MissingDatabaseUrlError)) {
    console.error("[api/files/:fileId] request failed", error);
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

function hasTaskAttachmentFileId(task: Task, fileId: string) {
  if (task.attachments?.some((attachment) => attachment.fileId === fileId)) {
    return true;
  }

  return task.comments?.some((comment) => comment.attachments?.some((attachment) => attachment.fileId === fileId)) ?? false;
}

function collectWorkspaceTasksForVisibilityCheck(snapshot: Awaited<ReturnType<typeof readWorkspaceSnapshot>>["state"]) {
  const taskById = new Map<string, Task>();

  for (const task of snapshot.tasks) {
    taskById.set(task.id, task);
  }

  for (const task of snapshot.kanbanTasks) {
    taskById.set(task.id, task);
  }

  for (const historyEntry of snapshot.kanbanHistory) {
    taskById.set(historyEntry.task.id, historyEntry.task);
  }

  return [...taskById.values()];
}

function canUserAccessAttachedTaskFile({
  snapshot,
  user,
  fileId
}: {
  snapshot: Awaited<ReturnType<typeof readWorkspaceSnapshot>>["state"];
  user: User;
  fileId: string;
}) {
  const tasks = collectWorkspaceTasksForVisibilityCheck(snapshot);

  for (const task of tasks) {
    const role = resolveRole({
      user,
      projectId: task.projectId,
      feature: "kanban",
      assignments: snapshot.permissions,
      projectMemberships: snapshot.projectMemberships,
      projects: snapshot.projects
    });

    if (!canSeeTask(user, task, role)) {
      continue;
    }

    if (hasTaskAttachmentFileId(task, fileId)) {
      return true;
    }
  }

  return false;
}

function toContentDisposition(fileName: string, mimeType: string) {
  const trimmedName = fileName.trim() || "attachment.bin";
  const asciiFallback = trimmedName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(trimmedName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  const isInline = mimeType.startsWith("image/") || mimeType === "application/pdf" || mimeType.startsWith("text/");
  const dispositionType = isInline ? "inline" : "attachment";

  return `${dispositionType}; filename="${asciiFallback || "attachment.bin"}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  const actorUserId = request.cookies.get("vk_user")?.value?.trim();
  if (!actorUserId) {
    return unauthorized();
  }

  const params = await context.params;
  const fileId = parseFileId(params.fileId);
  if (!fileId) {
    return badRequest("fileId is invalid.");
  }

  try {
    const workspaceFile = await readWorkspaceFile(fileId);
    if (!workspaceFile) {
      return notFound();
    }

    if (workspaceFile.uploaderId !== actorUserId) {
      const workspaceSnapshot = await readWorkspaceSnapshot(workspaceFile.workspaceId);
      const actor = workspaceSnapshot.state.users.find((user) => user.id === actorUserId);
      if (!actor) {
        return forbidden();
      }

      const canAccess = actor.baseRole === "admin" || canUserAccessAttachedTaskFile({
        snapshot: workspaceSnapshot.state,
        user: actor,
        fileId: workspaceFile.fileId
      });

      if (!canAccess) {
        return forbidden();
      }
    }

    const headers = new Headers(NO_STORE_HEADERS);
    headers.set("Content-Type", workspaceFile.mimeType || "application/octet-stream");
    headers.set("Content-Length", String(workspaceFile.size));
    headers.set("Content-Disposition", toContentDisposition(workspaceFile.name, workspaceFile.mimeType));

    const body = new Uint8Array(workspaceFile.content);
    return new NextResponse(body, {
      status: 200,
      headers
    });
  } catch (error) {
    return internalErrorResponse(error);
  }
}
