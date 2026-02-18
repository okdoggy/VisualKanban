import { redirect } from "next/navigation";

function readParam(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

export default async function TaskBoardRedirectPage({
  params
}: {
  params: Promise<{ projectId: string | string[] | undefined }>;
}) {
  const resolved = await params;
  const projectId = readParam(resolved.projectId);
  redirect(`/app/projects/${projectId}/gantt`);
}

