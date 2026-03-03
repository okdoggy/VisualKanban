import { Buffer } from "buffer";
import { NextRequest, NextResponse } from "next/server";
import { MissingDatabaseUrlError } from "@/lib/server/postgres";
import { createWorkspaceFile } from "@/lib/server/state/file-repository";
import { parseWorkspaceId } from "@/lib/state/shared-snapshot";
import type { TaskAttachment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store"
};

const MAX_ATTACHMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function resolveAttachmentKind(mimeType: string): TaskAttachment["kind"] {
  return mimeType.startsWith("image/") ? "image" : "document";
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
  const message = error instanceof MissingDatabaseUrlError ? error.message : "Failed to upload attachment file.";

  if (!(error instanceof MissingDatabaseUrlError)) {
    console.error("[api/files] request failed", error);
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

export async function POST(request: NextRequest) {
  const actorUserId = request.cookies.get("vk_user")?.value?.trim();
  if (!actorUserId) {
    return unauthorized();
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return badRequest("Request body must be multipart/form-data.");
  }

  const workspaceId = parseWorkspaceId(formData.get("workspaceId"));
  if (!workspaceId) {
    return badRequest("workspaceId must contain only letters, numbers, dot, underscore, or dash.");
  }

  const fileField = formData.get("file");
  if (!(fileField instanceof File)) {
    return badRequest("file is required.");
  }

  if (fileField.size <= 0) {
    return badRequest("Empty files are not allowed.");
  }

  if (fileField.size > MAX_ATTACHMENT_FILE_SIZE_BYTES) {
    return badRequest(`File size must be <= ${MAX_ATTACHMENT_FILE_SIZE_BYTES} bytes.`);
  }

  const mimeType = fileField.type || "application/octet-stream";
  const fileName = fileField.name?.trim() || "attachment.bin";

  try {
    const content = Buffer.from(await fileField.arrayBuffer());
    const saved = await createWorkspaceFile({
      workspaceId,
      uploaderId: actorUserId,
      name: fileName,
      mimeType,
      content
    });

    const attachment: TaskAttachment = {
      id: saved.fileId,
      fileId: saved.fileId,
      url: `/api/files/${encodeURIComponent(saved.fileId)}`,
      name: saved.name,
      mimeType: saved.mimeType,
      kind: resolveAttachmentKind(saved.mimeType),
      size: saved.size,
      createdAt: saved.createdAt,
      createdBy: saved.uploaderId
    };

    return NextResponse.json(
      {
        ok: true,
        workspaceId: saved.workspaceId,
        attachment
      },
      {
        status: 201,
        headers: NO_STORE_HEADERS
      }
    );
  } catch (error) {
    return internalErrorResponse(error);
  }
}
