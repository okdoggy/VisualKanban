import { KanbanBoard } from "@/components/app/kanban-board";

type KanbanPageProps = {
  params: Promise<{ projectId: string }> | { projectId: string };
};

export default async function KanbanPage({ params }: KanbanPageProps) {
  const { projectId } = await Promise.resolve(params);
  return <KanbanBoard projectId={projectId} />;
}
