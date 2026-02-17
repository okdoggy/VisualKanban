"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { canRead, canSeeTask, canWrite } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, useVisualKanbanStore } from "@/lib/store";
import type { TaskPriority, TaskStatus } from "@/lib/types";
import { useShallow } from "zustand/react/shallow";

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
  const [commentBody, setCommentBody] = useState("");
  const [feedback, setFeedback] = useState("");

  const { users, currentUserId, projects, permissions, tasks, comments, moveTask, addComment } = useVisualKanbanStore(useShallow((state) => ({
    users: state.users,
    currentUserId: state.currentUserId,
    projects: state.projects,
    permissions: state.permissions,
    tasks: state.tasks,
    comments: state.comments,
    moveTask: state.moveTask,
    addComment: state.addComment
  })));

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);
  const project = useMemo(() => projects.find((item) => item.id === projectId), [projectId, projects]);

  const taskboardRole = useMemo(
    () =>
      getEffectiveRoleForFeature({
        user: currentUser,
        projectId,
        feature: "taskboard",
        permissions
      }),
    [currentUser, permissions, projectId]
  );

  const task = useMemo(() => tasks.find((item) => item.id === taskId && item.projectId === projectId) ?? null, [projectId, taskId, tasks]);

  const taskComments = useMemo(
    () =>
      comments
        .filter((comment) => comment.taskId === taskId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [comments, taskId]
  );

  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  if (!canRead(taskboardRole)) {
    return <FeatureAccessDenied feature="Task Detail" />;
  }

  if (!project) {
    return (
      <Card>
        <CardTitle>프로젝트를 찾을 수 없습니다.</CardTitle>
        <CardDescription className="mt-1">잘못된 프로젝트 ID입니다: {projectId}</CardDescription>
      </Card>
    );
  }

  if (!task) {
    return (
      <Card>
        <CardTitle>태스크를 찾을 수 없습니다.</CardTitle>
        <CardDescription className="mt-1">잘못된 태스크 ID입니다: {taskId}</CardDescription>
      </Card>
    );
  }

  if (!canSeeTask(currentUser, task, taskboardRole)) {
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

  const onSubmitComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = addComment(task.id, commentBody);
    if (!result.ok) {
      setFeedback(result.reason ?? "댓글 등록에 실패했습니다.");
      return;
    }
    setCommentBody("");
    setFeedback("댓글이 등록되었습니다.");
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title={task.title}
        description={`${project.name} · 마지막 업데이트 ${formatDateTime(task.updatedAt)}`}
        role={taskboardRole}
        actions={
          <Link href={`/app/projects/${projectId}/board`} className="text-sm text-sky-600 hover:underline dark:text-sky-400">
            Task Board로 이동
          </Link>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusMeta[task.status].variant}>{statusMeta[task.status].label}</Badge>
            <Badge variant={priorityMeta[task.priority].variant}>{priorityMeta[task.priority].label}</Badge>
            <Badge variant={task.visibility === "private" ? "warning" : "neutral"}>
              {task.visibility === "private" ? "Private" : "Shared"}
            </Badge>
          </div>

          <div>
            <CardTitle>Summary</CardTitle>
            <CardDescription className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-200">{task.description}</CardDescription>
          </div>

          <div className="grid gap-2 text-sm md:grid-cols-2">
            <div className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-700/80">
              <p className="text-xs text-zinc-500">Assignee</p>
              <p className="mt-1 font-medium">{assignee?.displayName ?? task.assigneeId}</p>
            </div>
            <div className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-700/80">
              <p className="text-xs text-zinc-500">Reporter</p>
              <p className="mt-1 font-medium">{reporter?.displayName ?? task.reporterId}</p>
            </div>
            <div className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-700/80">
              <p className="text-xs text-zinc-500">Owner</p>
              <p className="mt-1 font-medium">{owner?.displayName ?? task.ownerId}</p>
            </div>
            <div className="rounded-lg border border-zinc-200/80 p-3 dark:border-zinc-700/80">
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
                  size="sm"
                  variant={status === task.status ? "default" : "secondary"}
                  disabled={!canWrite(taskboardRole)}
                  onClick={() => onMoveStatus(status)}
                >
                  {statusMeta[status].label}
                </Button>
              ))}
            </div>
            {!canWrite(taskboardRole) ? (
              <CardDescription>현재 권한은 읽기 전용입니다. 상태 변경은 Editor 이상에서 가능합니다.</CardDescription>
            ) : null}
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <CardTitle>Comments</CardTitle>
            <CardDescription className="mt-1">{taskComments.length}개의 댓글</CardDescription>
          </div>

          <form onSubmit={onSubmitComment} className="space-y-2">
            <textarea
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="코멘트를 입력하세요..."
              rows={4}
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
            />
            <Button type="submit" size="sm" className="w-full">
              댓글 등록
            </Button>
          </form>

          {feedback ? <p className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{feedback}</p> : null}

          <div className="max-h-[460px] space-y-2 overflow-auto pr-1">
            {taskComments.map((comment) => (
              <div key={comment.id} className="rounded-md border border-zinc-200/80 p-3 dark:border-zinc-700/80">
                <div className="mb-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{userMap.get(comment.authorId)?.displayName ?? comment.authorId}</span>
                  <span>{formatDateTime(comment.createdAt)}</span>
                </div>
                <p className="text-sm leading-6">{comment.body}</p>
              </div>
            ))}
            {taskComments.length === 0 ? <p className="text-sm text-zinc-500">첫 댓글을 작성해 보세요.</p> : null}
          </div>
        </Card>
      </div>
    </section>
  );
}
