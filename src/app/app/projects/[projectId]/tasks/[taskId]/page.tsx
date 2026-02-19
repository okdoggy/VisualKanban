"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { canRead, canSeeTask, canWrite } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, useVisualKanbanStore } from "@/lib/store";
import type { TaskPriority, TaskStatus } from "@/lib/types";
import { useShallow } from "zustand/react/shallow";

const neoCard =
  "rounded-2xl border-2 border-zinc-900 bg-white shadow-[4px_4px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[4px_4px_0_0_rgb(0,0,0)]";
const neoButton =
  "border-2 border-zinc-900 shadow-[2px_2px_0_0_rgb(24,24,27)] transition hover:-translate-y-0.5 hover:shadow-none dark:border-zinc-100 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]";

const statusMeta: Record<TaskStatus, { label: string; variant: "warning" | "info" | "success" }> = {
  backlog: { label: "Backlog", variant: "warning" },
  in_progress: { label: "In Progress", variant: "info" },
  done: { label: "Done", variant: "success" }
};

const priorityMeta: Record<TaskPriority, { label: string; variant: "neutral" | "warning" | "danger" }> = {
  low: { label: "Low", variant: "neutral" },
  medium: { label: "Medium", variant: "warning" },
  high: { label: "High", variant: "danger" }
};

function readParam(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function formatDateTime(value: string | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR");
}

export default function TaskDetailPage() {
  const params = useParams<{ projectId: string; taskId: string }>();
  const projectId = readParam(params.projectId);
  const taskId = readParam(params.taskId);
  const [feedback, setFeedback] = useState("");

  const { users, currentUserId, projects, projectMemberships, permissions, tasks, moveTask } = useVisualKanbanStore(
    useShallow((state) => ({
      users: state.users,
      currentUserId: state.currentUserId,
      projects: state.projects,
      projectMemberships: state.projectMemberships,
      permissions: state.permissions,
      tasks: state.tasks,
      moveTask: state.moveTask
    }))
  );

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);
  const project = useMemo(() => projects.find((item) => item.id === projectId), [projectId, projects]);

  const taskAccessRole = useMemo(
    () =>
      getEffectiveRoleForFeature({
        user: currentUser,
        projectId,
        feature: "gantt",
        permissions,
        projectMemberships,
        projects
      }),
    [currentUser, permissions, projectId, projectMemberships, projects]
  );

  const task = useMemo(() => tasks.find((item) => item.id === taskId && item.projectId === projectId) ?? null, [projectId, taskId, tasks]);

  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const writable = canWrite(taskAccessRole);

  if (!canRead(taskAccessRole)) {
    return <FeatureAccessDenied feature="Task Detail" />;
  }

  if (!project) {
    return (
      <Card className={neoCard}>
        <CardTitle>프로젝트를 찾을 수 없습니다.</CardTitle>
        <CardDescription className="mt-1">잘못된 프로젝트 ID입니다: {projectId}</CardDescription>
      </Card>
    );
  }

  if (!task) {
    return (
      <Card className={neoCard}>
        <CardTitle>태스크를 찾을 수 없습니다.</CardTitle>
        <CardDescription className="mt-1">잘못된 태스크 ID입니다: {taskId}</CardDescription>
      </Card>
    );
  }

  if (!canSeeTask(currentUser, task, taskAccessRole)) {
    return <FeatureAccessDenied feature="Task Detail" message="이 태스크는 현재 계정으로 볼 수 없습니다." />;
  }

  const assignee = userMap.get(task.assigneeId);
  const reporter = userMap.get(task.reporterId);
  const owner = userMap.get(task.ownerId);

  const onMoveStatus = (nextStatus: TaskStatus) => {
    if (nextStatus === task.status) return;
    const result = moveTask(task.id, nextStatus);
    if (!result.ok) {
      setFeedback(result.reason ?? "상태 변경에 실패했습니다.");
      return;
    }
    setFeedback("상태가 업데이트되었습니다.");
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title={task.title}
        description={`${project.name} · 마지막 업데이트 ${formatDateTime(task.updatedAt)}`}
        role={taskAccessRole}
        actions={
          <Link href={`/app/projects/${projectId}/gantt`} className="text-sm text-sky-600 hover:underline dark:text-sky-400">
            간트차트로 이동
          </Link>
        }
      />

      <Card className={`${neoCard} space-y-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusMeta[task.status].variant}>{statusMeta[task.status].label}</Badge>
          <Badge variant={priorityMeta[task.priority].variant}>{priorityMeta[task.priority].label}</Badge>
          <Badge variant={task.visibility === "private" ? "warning" : "neutral"}>{task.visibility === "private" ? "Private" : "Shared"}</Badge>
        </div>

        <div>
          <CardTitle>Summary</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-200">{task.description}</CardDescription>
        </div>

        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-xl border-2 border-zinc-900 bg-zinc-50 p-3 shadow-[2px_2px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-800/60 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]">
            <p className="text-xs text-zinc-500">Assignee</p>
            <p className="mt-1 font-medium">{assignee?.displayName ?? task.assigneeId}</p>
          </div>
          <div className="rounded-xl border-2 border-zinc-900 bg-zinc-50 p-3 shadow-[2px_2px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-800/60 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]">
            <p className="text-xs text-zinc-500">Reporter</p>
            <p className="mt-1 font-medium">{reporter?.displayName ?? task.reporterId}</p>
          </div>
          <div className="rounded-xl border-2 border-zinc-900 bg-zinc-50 p-3 shadow-[2px_2px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-800/60 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]">
            <p className="text-xs text-zinc-500">Owner</p>
            <p className="mt-1 font-medium">{owner?.displayName ?? task.ownerId}</p>
          </div>
          <div className="rounded-xl border-2 border-zinc-900 bg-zinc-50 p-3 shadow-[2px_2px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-800/60 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]">
            <p className="text-xs text-zinc-500">Due Date</p>
            <p className="mt-1 font-medium">{formatDateTime(task.dueDate)}</p>
          </div>
        </div>

        <div className="space-y-2">
          <CardTitle>Status 변경</CardTitle>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(statusMeta) as TaskStatus[]).map((status) => (
              <Button
                key={status}
                className={neoButton}
                size="sm"
                variant={status === task.status ? "default" : "secondary"}
                disabled={!writable}
                onClick={() => onMoveStatus(status)}
              >
                {statusMeta[status].label}
              </Button>
            ))}
          </div>
          {!writable ? <CardDescription>현재 권한은 읽기 전용입니다. 상태 변경은 Editor 이상에서 가능합니다.</CardDescription> : null}
        </div>

        {feedback ? (
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="rounded-md border-2 border-zinc-900 bg-zinc-100 px-3 py-2 text-xs text-zinc-700 shadow-[2px_2px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-800 dark:text-zinc-200 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]"
          >
            {feedback}
          </p>
        ) : null}
      </Card>
    </section>
  );
}
