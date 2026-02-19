"use client";

import { type Edge, type Node } from "@xyflow/react";
import { useParams, useRouter } from "next/navigation";
import { type MouseEvent as ReactMouseEvent, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { MindmapFlow } from "@/components/app/mindmap-flow";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { canRead, canSeeTask } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, useVisualKanbanStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

const neoCard =
  "rounded-2xl border-2 border-zinc-900 bg-white shadow-[4px_4px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[4px_4px_0_0_rgb(0,0,0)]";

type FlowNodeData = {
  label: string;
  taskId?: string;
};

type FlowNode = Node<FlowNodeData>;

function readParam(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

export default function MindmapPage() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = readParam(params.projectId);

  const { users, currentUserId, projects, projectMemberships, permissions, tasks, mindmapNodes } = useVisualKanbanStore(
    useShallow((state) => ({
      users: state.users,
      currentUserId: state.currentUserId,
      projects: state.projects,
      projectMemberships: state.projectMemberships,
      permissions: state.permissions,
      tasks: state.tasks,
      mindmapNodes: state.mindmapNodes
    }))
  );

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);
  const project = useMemo(() => projects.find((item) => item.id === projectId) ?? null, [projects, projectId]);
  const projectMindmapNodes = useMemo(() => mindmapNodes.filter((item) => item.projectId === projectId), [mindmapNodes, projectId]);

  const mindmapRole = useMemo(
    () =>
      getEffectiveRoleForFeature({
        user: currentUser,
        projectId,
        feature: "mindmap",
        permissions,
        projectMemberships,
        projects
      }),
    [currentUser, permissions, projectId, projectMemberships, projects]
  );

  const visibleProjectTaskMap = useMemo(
    () =>
      new Map(
        tasks
          .filter((task) => task.projectId === projectId)
          .filter((task) => canSeeTask(currentUser, task, mindmapRole))
          .map((task) => [task.id, task])
      ),
    [currentUser, mindmapRole, projectId, tasks]
  );

  const visibleMindmapNodes = useMemo(
    () => projectMindmapNodes.filter((node) => !node.taskId || visibleProjectTaskMap.has(node.taskId)),
    [projectMindmapNodes, visibleProjectTaskMap]
  );

  const flowNodes = useMemo<FlowNode[]>(
    () =>
      visibleMindmapNodes.map((node) => ({
        id: node.id,
        position: { x: node.x, y: node.y },
        data: {
          label: node.label,
          taskId: node.taskId
        },
        style: {
          border: "2px solid #18181b",
          borderRadius: 14,
          boxShadow: "3px 3px 0 0 #18181b",
          padding: "10px 12px",
          minWidth: 140,
          fontWeight: 700,
          background: "#ffffff"
        }
      })),
    [visibleMindmapNodes]
  );

  const flowEdges = useMemo<Edge[]>(() => {
    const idSet = new Set(visibleMindmapNodes.map((item) => item.id));
    return visibleMindmapNodes
      .filter((item) => item.parentId && idSet.has(item.parentId))
      .map((item) => ({
        id: `edge-${item.parentId}-${item.id}`,
        source: item.parentId as string,
        target: item.id,
        style: {
          stroke: "#27272a",
          strokeWidth: 2
        }
      }));
  }, [visibleMindmapNodes]);

  const linkedTaskCount = useMemo(
    () => visibleMindmapNodes.filter((node) => node.taskId && visibleProjectTaskMap.has(node.taskId)).length,
    [visibleMindmapNodes, visibleProjectTaskMap]
  );

  const handleNodeClick = useCallback(
    (_event: ReactMouseEvent, node: FlowNode) => {
      const taskId = node.data.taskId;
      if (!taskId) return;
      if (!visibleProjectTaskMap.has(taskId)) {
        toast.warning("연결된 태스크를 찾을 수 없습니다.");
        return;
      }
      router.push(`/app/projects/${projectId}/tasks/${taskId}`);
      toast.success("연결된 태스크로 이동합니다.");
    },
    [projectId, router, visibleProjectTaskMap]
  );

  if (!canRead(mindmapRole)) {
    return <FeatureAccessDenied feature="Mindmap" />;
  }

  if (!project) {
    return (
      <Card className={neoCard}>
        <CardTitle>프로젝트를 찾을 수 없습니다.</CardTitle>
        <CardDescription className="mt-1">잘못된 프로젝트 ID입니다: {projectId}</CardDescription>
      </Card>
    );
  }

  return (
    <section className="space-y-4" aria-label="Mindmap view">
      <PageHeader
        title={`${project.name} Mindmap`}
        description="마인드맵은 구조/연결을 빠르게 확인하는 뷰입니다. 자유 드로잉 편집은 Whiteboard에서 진행하세요."
        role={mindmapRole}
        actions={
          <Button type="button" size="sm" variant="secondary" onClick={() => router.push(`/app/projects/${projectId}/whiteboard`)}>
            Whiteboard 열기
          </Button>
        }
      />

      <Card className={neoCard}>
        <CardDescription>
          노드 {flowNodes.length}개 · 연결선 {flowEdges.length}개 · 연결된 태스크 {linkedTaskCount}개
        </CardDescription>
      </Card>

      {flowNodes.length === 0 ? (
        <Card className={neoCard}>
          <CardTitle>표시할 마인드맵 노드가 없습니다.</CardTitle>
          <CardDescription className="mt-1">프로젝트 데이터에 mindmapNodes를 추가하면 이 화면에 즉시 반영됩니다.</CardDescription>
        </Card>
      ) : (
        <Card className={`${neoCard} h-[78vh] overflow-hidden p-0`}>
          <MindmapFlow nodes={flowNodes} edges={flowEdges} onNodeClick={handleNodeClick} />
        </Card>
      )}
    </section>
  );
}
