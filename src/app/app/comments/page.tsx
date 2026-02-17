"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { canRead } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, getVisibleTasks, useVisualKanbanStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR");
}

type Thread = {
  taskId: string;
  taskTitle: string;
  projectId: string;
  commentCount: number;
  latestAt: number;
  items: {
    id: string;
    authorName: string;
    body: string;
    createdAt: string;
  }[];
};

export default function CommentsPage() {
  const [query, setQuery] = useState("");

  const { users, currentUserId, projects, permissions, tasks, comments } = useVisualKanbanStore(useShallow((state) => ({
    users: state.users,
    currentUserId: state.currentUserId,
    projects: state.projects,
    permissions: state.permissions,
    tasks: state.tasks,
    comments: state.comments
  })));

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);
  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

  const roleByProject = useMemo(
    () =>
      new Map(
        projects.map((project) => [
          project.id,
          getEffectiveRoleForFeature({
            user: currentUser,
            projectId: project.id,
            feature: "comments",
            permissions
          })
        ])
      ),
    [currentUser, permissions, projects]
  );

  const readableProjectIds = useMemo(
    () => projects.filter((project) => canRead(roleByProject.get(project.id) ?? "none")).map((project) => project.id),
    [projects, roleByProject]
  );

  const visibleTasks = useMemo(
    () =>
      readableProjectIds.flatMap((projectId) => {
        const role = roleByProject.get(projectId) ?? "none";
        const taskList = tasks.filter((task) => task.projectId === projectId);
        return getVisibleTasks({ tasks: taskList, user: currentUser, role });
      }),
    [currentUser, readableProjectIds, roleByProject, tasks]
  );

  const taskMap = useMemo(() => new Map(visibleTasks.map((task) => [task.id, task])), [visibleTasks]);

  const threads = useMemo<Thread[]>(() => {
    const normalized = query.trim().toLowerCase();

    const filteredComments = comments.filter((comment) => {
      const task = taskMap.get(comment.taskId);
      if (!task) return false;
      if (!normalized) return true;
      const author = userMap.get(comment.authorId);
      return (
        comment.body.toLowerCase().includes(normalized) ||
        task.title.toLowerCase().includes(normalized) ||
        (author?.displayName.toLowerCase().includes(normalized) ?? false)
      );
    });

    const bucket = new Map<string, Thread>();

    filteredComments.forEach((comment) => {
      const task = taskMap.get(comment.taskId);
      if (!task) return;
      const author = userMap.get(comment.authorId);
      const createdAt = new Date(comment.createdAt).getTime();

      const existing = bucket.get(task.id);
      if (!existing) {
        bucket.set(task.id, {
          taskId: task.id,
          taskTitle: task.title,
          projectId: task.projectId,
          commentCount: 1,
          latestAt: createdAt,
          items: [
            {
              id: comment.id,
              authorName: author?.displayName ?? comment.authorId,
              body: comment.body,
              createdAt: comment.createdAt
            }
          ]
        });
        return;
      }

      existing.commentCount += 1;
      existing.latestAt = Math.max(existing.latestAt, createdAt);
      existing.items.push({
        id: comment.id,
        authorName: author?.displayName ?? comment.authorId,
        body: comment.body,
        createdAt: comment.createdAt
      });
    });

    return Array.from(bucket.values())
      .map((thread) => ({
        ...thread,
        items: thread.items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      }))
      .sort((a, b) => b.latestAt - a.latestAt);
  }, [comments, query, taskMap, userMap]);

  if (readableProjectIds.length === 0) {
    return <FeatureAccessDenied feature="Comments" />;
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title="Comments Hub"
        description="태스크별 코멘트를 한 화면에서 모아 보고, 빠르게 상세 페이지로 점프하세요."
        role={(roleByProject.get(readableProjectIds[0]) ?? "none").toString()}
      />

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Aggregated Threads</CardTitle>
          <div className="w-full max-w-sm">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="태스크/작성자/댓글 내용 검색" />
          </div>
        </div>
        <CardDescription>
          조회 가능 프로젝트 {readableProjectIds.length}개 · 스레드 {threads.length}개 · 댓글{" "}
          {threads.reduce((acc, item) => acc + item.commentCount, 0)}개
        </CardDescription>
      </Card>

      {threads.length === 0 ? (
        <Card>
          <CardTitle>표시할 댓글 스레드가 없습니다.</CardTitle>
          <CardDescription className="mt-1">검색 조건을 바꾸거나 새 댓글을 작성해 보세요.</CardDescription>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="h-fit xl:sticky xl:top-28">
            <CardTitle>Quick Jump</CardTitle>
            <div className="mt-3 space-y-2">
              {threads.map((thread) => (
                <a
                  key={thread.taskId}
                  href={`#thread-${thread.taskId}`}
                  className="block rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  <p className="line-clamp-1 font-medium">{thread.taskTitle}</p>
                  <p className="text-xs text-zinc-500">{thread.commentCount} comments</p>
                </a>
              ))}
            </div>
          </Card>

          <div className="space-y-3">
            {threads.map((thread) => (
              <Card key={thread.taskId} id={`thread-${thread.taskId}`} className="scroll-mt-28">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle>{thread.taskTitle}</CardTitle>
                    <CardDescription className="mt-1">
                      {projectMap.get(thread.projectId)?.name ?? thread.projectId} · 마지막 활동 {formatDateTime(new Date(thread.latestAt).toISOString())}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="info">{thread.commentCount} comments</Badge>
                    <Link
                      href={`/app/projects/${thread.projectId}/tasks/${thread.taskId}`}
                      className="text-xs text-sky-600 hover:underline dark:text-sky-400"
                    >
                      Task Detail
                    </Link>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {thread.items.map((item) => (
                    <div key={item.id} className="rounded-md border border-zinc-200/80 p-3 dark:border-zinc-700/80">
                      <div className="mb-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                        <span>{item.authorName}</span>
                        <span>{formatDateTime(item.createdAt)}</span>
                      </div>
                      <p className="text-sm leading-6">{item.body}</p>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
