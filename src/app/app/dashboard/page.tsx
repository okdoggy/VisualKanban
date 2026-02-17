"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CalendarDays, CheckSquare2, ClipboardList, Clock3, ListTodo } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { canRead, canSeeTask, canWrite } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, useVisualKanbanStore } from "@/lib/store";
import type { Task, TaskStatus } from "@/lib/types";

const statusLabel: Record<TaskStatus, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  done: "Done"
};

const statusTone: Record<TaskStatus, { badge: "warning" | "info" | "success"; bar: string }> = {
  backlog: { badge: "warning", bar: "from-amber-400 to-amber-500" },
  in_progress: { badge: "info", bar: "from-sky-400 to-sky-500" },
  done: { badge: "success", bar: "from-emerald-400 to-emerald-500" }
};

function safeDate(input?: string) {
  const parsed = input ? new Date(input) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function daySerial(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDiff(from: Date, to: Date) {
  return Math.round((daySerial(to) - daySerial(from)) / 86_400_000);
}

function taskRange(task: Task) {
  const start = safeDate(task.startDate ?? task.updatedAt ?? task.dueDate);
  const end = safeDate(task.endDate ?? task.dueDate ?? task.startDate ?? task.updatedAt);
  if (end < start) return { start: end, end: start };
  return { start, end };
}

function formatShortDate(dateLike: string | Date) {
  const date = dateLike instanceof Date ? dateLike : safeDate(dateLike);
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(date);
}

function sortByDue(taskA: Task, taskB: Task) {
  return safeDate(taskA.dueDate).getTime() - safeDate(taskB.dueDate).getTime();
}

export default function DashboardPage() {
  const router = useRouter();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const { users, projects, tasks, permissions, currentUserId, moveTask } = useVisualKanbanStore(
    useShallow((state) => ({
      users: state.users,
      projects: state.projects,
      tasks: state.tasks,
      permissions: state.permissions,
      currentUserId: state.currentUserId,
      moveTask: state.moveTask
    }))
  );

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);
  const project = useMemo(() => projects[0] ?? null, [projects]);

  const role = useMemo(() => {
    if (!project) return "none" as const;
    return getEffectiveRoleForFeature({
      user: currentUser,
      projectId: project.id,
      feature: "project",
      permissions
    });
  }, [currentUser, permissions, project]);

  const writable = canWrite(role);

  const myAssignedTasks = useMemo(() => {
    if (!project || !currentUser) return [];
    return tasks
      .filter((task) => task.projectId === project.id)
      .filter((task) => canSeeTask(currentUser, task, role))
      .filter((task) => task.assigneeId === currentUser.id)
      .sort(sortByDue);
  }, [currentUser, project, role, tasks]);

  const todoItems = useMemo(() => myAssignedTasks.slice(0, 8), [myAssignedTasks]);

  const taskSummary = useMemo(() => {
    const total = myAssignedTasks.length;
    const backlog = myAssignedTasks.filter((task) => task.status === "backlog").length;
    const inProgress = myAssignedTasks.filter((task) => task.status === "in_progress").length;
    const done = myAssignedTasks.filter((task) => task.status === "done").length;
    const highPriority = myAssignedTasks.filter((task) => task.priority === "high" && task.status !== "done").length;
    const completionRate = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, backlog, inProgress, done, highPriority, completionRate };
  }, [myAssignedTasks]);

  const ganttRows = useMemo(
    () =>
      myAssignedTasks.map((task) => ({
        task,
        ...taskRange(task)
      })),
    [myAssignedTasks]
  );

  const ganttRange = useMemo(() => {
    if (ganttRows.length === 0) {
      const today = new Date();
      return { start: today, end: today, totalDays: 1 };
    }

    const start = ganttRows.reduce((min, row) => (row.start < min ? row.start : min), ganttRows[0].start);
    const end = ganttRows.reduce((max, row) => (row.end > max ? row.end : max), ganttRows[0].end);
    return {
      start,
      end,
      totalDays: Math.max(1, dayDiff(start, end) + 1)
    };
  }, [ganttRows]);

  const onToggleTodo = (task: Task, checked: boolean) => {
    if (!writable) {
      setFeedback({ tone: "error", message: "Viewer 권한은 체크 변경이 불가합니다." });
      return;
    }

    const nextStatus: TaskStatus = checked ? "done" : "backlog";
    const result = moveTask(task.id, nextStatus);
    if (!result.ok) {
      setFeedback({ tone: "error", message: result.reason ?? "상태 변경 실패" });
      return;
    }

    setFeedback({
      tone: "success",
      message: checked ? `"${task.title}" 완료 처리됨` : `"${task.title}"를 To do로 되돌렸습니다.`
    });
  };

  if (!currentUser) {
    return (
      <Card className="p-8">
        <CardTitle>세션 확인 중...</CardTitle>
        <CardDescription className="mt-2">로그인 사용자 정보를 불러오고 있습니다.</CardDescription>
      </Card>
    );
  }

  if (!project) {
    return (
      <Card className="p-8">
        <CardTitle>프로젝트가 없습니다</CardTitle>
        <CardDescription className="mt-2">프로젝트를 연결하면 대시보드가 활성화됩니다.</CardDescription>
      </Card>
    );
  }

  if (!canRead(role)) {
    return (
      <>
        <PageHeader title="대시보드" description="로그인 후 첫 화면" role={role.toUpperCase()} />
        <FeatureAccessDenied feature="Dashboard" />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="대시보드"
        description="나에게 할당된 To do, Task 요약, 프로젝트 간트차트를 한 화면에서 확인합니다."
        role={role.toUpperCase()}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => router.push(`/app/projects/${project.id}/gantt`)}>
              간트차트 편집
            </Button>
          </div>
        }
      />

      {feedback ? (
        <Card className={feedback.tone === "success" ? "border-emerald-200 bg-emerald-50/70" : "border-rose-200 bg-rose-50/70"}>
          <CardDescription className={feedback.tone === "success" ? "text-emerald-700" : "text-rose-700"}>{feedback.message}</CardDescription>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <CardTitle>내 To do</CardTitle>
              <CardDescription>왼쪽 상단 영역: 나에게 할당된 To do 체크리스트</CardDescription>
            </div>
            <ListTodo className="h-4 w-4 text-sky-500" />
          </div>

          {todoItems.length === 0 ? (
            <CardDescription>할당된 To do가 없습니다.</CardDescription>
          ) : (
            <div className="space-y-2">
              {todoItems.map((task) => {
                const checked = task.status === "done";
                return (
                  <label
                    key={task.id}
                    className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 transition hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/40"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                      checked={checked}
                      onChange={(event) => onToggleTodo(task, event.target.checked)}
                      disabled={!writable}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium ${checked ? "line-through text-zinc-400" : "text-zinc-900 dark:text-zinc-100"}`}>{task.title}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant={statusTone[task.status].badge}>{statusLabel[task.status]}</Badge>
                        <span className="text-xs text-zinc-500">마감 {formatShortDate(task.dueDate)}</span>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <CardTitle>내 Task 요약</CardTitle>
              <CardDescription>오른쪽 상단 영역: 나에게 할당된 Task 현황 요약</CardDescription>
            </div>
            <ClipboardList className="h-4 w-4 text-violet-500" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="text-xs text-zinc-500">전체</p>
              <p className="text-xl font-semibold">{taskSummary.total}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="text-xs text-zinc-500">완료율</p>
              <p className="text-xl font-semibold">{taskSummary.completionRate}%</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="text-xs text-zinc-500">In Progress</p>
              <p className="text-xl font-semibold">{taskSummary.inProgress}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <p className="text-xs text-zinc-500">긴급(High)</p>
              <p className="text-xl font-semibold">{taskSummary.highPriority}</p>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
              <span>Backlog {taskSummary.backlog}</span>
              <span>Done {taskSummary.done}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" style={{ width: `${taskSummary.completionRate}%` }} />
            </div>
          </div>
        </Card>
      </section>

      <Card>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <CardTitle>내 프로젝트 간트차트</CardTitle>
            <CardDescription>
              중간~하단 영역: 마우스 오버 시 상세 정보, 더블클릭 시 간트차트 편집 페이지로 이동
            </CardDescription>
          </div>
          <Badge variant="info">
            <CalendarDays className="mr-1 h-3.5 w-3.5" />
            {formatShortDate(ganttRange.start)} ~ {formatShortDate(ganttRange.end)}
          </Badge>
        </div>

        {ganttRows.length === 0 ? (
          <CardDescription>표시할 간트 데이터가 없습니다.</CardDescription>
        ) : (
          <div className="space-y-3">
            {ganttRows.map(({ task, start, end }) => {
              const left = (dayDiff(ganttRange.start, start) / ganttRange.totalDays) * 100;
              const width = (Math.max(1, dayDiff(start, end) + 1) / ganttRange.totalDays) * 100;

              return (
                <div
                  key={task.id}
                  className="group rounded-lg border border-zinc-200 p-3 transition hover:border-sky-300 hover:bg-sky-50/40 dark:border-zinc-700 dark:hover:border-sky-700 dark:hover:bg-sky-950/20"
                  onDoubleClick={() => router.push(`/app/projects/${project.id}/gantt`)}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-zinc-500">
                        {formatShortDate(start)} ~ {formatShortDate(end)} · {statusLabel[task.status]}
                      </p>
                    </div>
                    <Badge variant={statusTone[task.status].badge}>{statusLabel[task.status]}</Badge>
                  </div>

                  <div className="relative">
                    <div className="h-3 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                    <div
                      className={`absolute top-0 h-3 rounded-full bg-gradient-to-r ${statusTone[task.status].bar}`}
                      style={{ left: `${left}%`, width: `${Math.max(width, 6)}%` }}
                    />

                    <div className="pointer-events-none absolute left-2 top-[-44px] z-10 rounded-md border border-zinc-200 bg-white/95 px-2 py-1 text-[11px] text-zinc-700 opacity-0 shadow-sm transition group-hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200">
                      담당: {currentUser.displayName} · 마감: {formatShortDate(task.dueDate)}
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Clock3 className="h-3.5 w-3.5" />
              바 영역에 마우스를 올리면 상세가 보이고, 더블클릭하면 간트차트 페이지로 이동합니다.
            </div>
          </div>
        )}
      </Card>

      {!writable ? (
        <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <CheckSquare2 className="h-4 w-4" />
            <p className="text-sm">현재 권한은 읽기 전용입니다. 체크/상태 변경은 Editor 이상에서 가능합니다.</p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
