import { redirect } from "next/navigation";

export const metadata = {
  title: "Task Board (Alias) → Gantt"
};

function readParam(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

export default async function TaskBoardAliasRedirectPage({
  params
}: {
  params: Promise<{ projectId: string | string[] | undefined }>;
}) {
  const resolved = await params;
  const projectId = readParam(resolved.projectId);
  // Legacy `/board` URL is intentionally preserved as an alias to `/gantt`
  // for bookmarks/external links.
  redirect(`/app/projects/${projectId}/gantt`);
}
