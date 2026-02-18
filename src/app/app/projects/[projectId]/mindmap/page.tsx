"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { canRead } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, useVisualKanbanStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

const neoCard =
  "rounded-2xl border-2 border-zinc-900 bg-white shadow-[4px_4px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[4px_4px_0_0_rgb(0,0,0)]";

type FlowNodeData = {
  label: string;
  taskId?: string;
};

const MindmapFlow = dynamic(() => import("@/components/app/mindmap-flow").then((mod) => mod.MindmapFlow), {
  ssr: false
});

function readParam(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

export default function MindmapPage() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = readParam(params.projectId);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const { users, currentUserId, projects, permissions, tasks, mindmapNodes } = useVisualKanbanStore(useShallow((state) => ({
    users: state.users,
    currentUserId: state.currentUserId,
    projects: state.projects,
    permissions: state.permissions,
    tasks: state.tasks,
    mindmapNodes: state.mindmapNodes
  })));

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);
  const mindmapRole = useMemo(
    () =>
      getEffectiveRoleForFeature({
        user: currentUser,
        projectId,
        feature: "mindmap",
        permissions
      }),
    [currentUser, permissions, projectId]
  );

  const project = useMemo(() => projects.find((item) => item.id === projectId), [projects, projectId]);
  const projectNodes = useMemo(() => mindmapNodes.filter((node) => node.projectId === projectId), [mindmapNodes, projectId]);

  const flowNodes = useMemo<Node<FlowNodeData>[]>(
    () =>
      projectNodes.map((node) => ({
        id: node.id,
        position: { x: node.x, y: node.y },
        data: { label: node.label, taskId: node.taskId },
        style: {
          borderRadius: 12,
          border: node.taskId ? "1px solid rgb(56 189 248 / 0.7)" : "1px solid rgb(161 161 170 / 0.5)",
          background: node.taskId ? "rgba(14, 165, 233, 0.08)" : "rgba(244, 244, 245, 0.7)",
          color: "inherit",
          minWidth: 160,
          boxShadow: "0 1px 2px rgba(0,0,0,0.08)"
        }
      })),
    [projectNodes]
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      projectNodes
        .filter((node) => node.parentId)
        .map((node) => ({
          id: `${node.parentId}-${node.id}`,
          source: node.parentId as string,
          target: node.id,
          animated: Boolean(node.taskId),
          style: { stroke: node.taskId ? "rgb(14 165 233 / 0.65)" : "rgb(113 113 122 / 0.45)" }
        })),
    [projectNodes]
  );

  const selectedNode = useMemo(() => flowNodes.find((node) => node.id === selectedNodeId) ?? null, [flowNodes, selectedNodeId]);
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedNode?.data.taskId && task.projectId === projectId) ?? null,
    [projectId, selectedNode, tasks]
  );

  const linkedNodes = useMemo(() => flowNodes.filter((node) => node.data.taskId), [flowNodes]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<FlowNodeData>) => {
      setSelectedNodeId(node.id);
      if (node.data.taskId) {
        router.push(`/app/projects/${projectId}/tasks/${node.data.taskId}`);
      }
    },
    [projectId, router]
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
    <section className="space-y-4">
      <PageHeader
        title={`${project.name} Mindmap`}
        description="노드를 클릭하면 연결된 태스크 상세 페이지로 이동합니다."
        role={mindmapRole}
      />

      {flowNodes.length === 0 ? (
        <Card className={neoCard}>
          <CardTitle>Mindmap 데이터가 없습니다.</CardTitle>
          <CardDescription className="mt-1">seed 데이터를 확인해 노드를 추가하세요.</CardDescription>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className={`${neoCard} h-[72vh] overflow-hidden p-0`}>
            <MindmapFlow nodes={flowNodes} edges={flowEdges} onNodeClick={handleNodeClick} />
          </Card>

          <Card className={`${neoCard} space-y-4`}>
            <div>
              <CardTitle>Task-linked Nodes</CardTitle>
              <CardDescription className="mt-1">클릭 시 즉시 Task Detail로 이동합니다.</CardDescription>
            </div>

            <div className="space-y-2">
              {linkedNodes.map((node) => (
                <Link
                  key={node.id}
                  href={`/app/projects/${projectId}/tasks/${node.data.taskId}`}
                  className="block rounded-lg border-2 border-zinc-900 bg-zinc-100 px-3 py-2 text-sm shadow-[2px_2px_0_0_rgb(24,24,27)] transition hover:-translate-y-0.5 hover:shadow-none dark:border-zinc-100 dark:bg-zinc-800 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{node.data.label}</span>
                    <Badge variant="info">Task</Badge>
                  </div>
                </Link>
              ))}
              {linkedNodes.length === 0 ? <p className="text-sm text-zinc-500">태스크와 연결된 노드가 없습니다.</p> : null}
            </div>

            <div className="rounded-xl border-2 border-zinc-900 bg-zinc-50 p-3 text-xs text-zinc-600 shadow-[2px_2px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-800/70 dark:text-zinc-300 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]">
              <p className="font-medium">선택된 노드</p>
              {selectedNode ? (
                <div className="mt-2 space-y-1">
                  <p>라벨: {selectedNode.data.label}</p>
                  <p>Node ID: {selectedNode.id}</p>
                  {selectedTask ? (
                    <p className="text-sky-600 dark:text-sky-300">연결 Task: {selectedTask.title}</p>
                  ) : (
                    <p>연결 Task: 없음</p>
                  )}
                </div>
              ) : (
                <p className="mt-2">아직 노드가 선택되지 않았습니다.</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
