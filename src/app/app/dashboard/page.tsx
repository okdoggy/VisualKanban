"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CirclePlus, FolderKanban, ListTodo, SquareKanban } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { canRead, canSeeTask } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, useVisualKanbanStore } from "@/lib/store";
import type { PersonalTodo, Task } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

const neoCard =
  "rounded-2xl border-2 border-zinc-900 bg-white shadow-[4px_4px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[4px_4px_0_0_rgb(0,0,0)]";
const TOOLBAR_CONTROL_CLASS =
  "border-2 border-zinc-900 shadow-[2px_2px_0_0_rgb(24,24,27)] transition-[transform,box-shadow,background-color,border-color,color] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-none active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none dark:border-zinc-100 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]";

const KANBAN_TODO_TAG = "kanban-stage:todo";

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

function startOfWeekMonday(base: Date) {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfWeekSunday(base: Date) {
  const start = startOfWeekMonday(base);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function overlapsWeek(task: Task, weekStart: Date, weekEnd: Date) {
  const { start, end } = taskRange(task);
  return start <= weekEnd && end >= weekStart;
}

function readKanbanStage(task: Task) {
  if (task.status === "backlog" && task.tags.includes(KANBAN_TODO_TAG)) return "todo" as const;
  return task.status;
}

function todoSort(a: PersonalTodo, b: PersonalTodo) {
  if (a.completed !== b.completed) {
    return Number(a.completed) - Number(b.completed);
  }
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export default function DashboardPage() {
  const router = useRouter();
  const projectPopupRef = useRef<HTMLDivElement>(null);
  const [projectPopupOpen, setProjectPopupOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [selectedProjectIdByAccountId, setSelectedProjectIdByAccountId] = useState<Record<string, string>>({});

  const {
    users,
    projects,
    projectMemberships,
    permissions,
    tasks,
    kanbanTasks,
    personalTodos,
    currentUserId,
    recentProjectIdByAccountId,
    connectedUserIds,
    toggleTodo,
    cleanupTodos,
    addProject,
    setRecentProjectForCurrentAccount
  } = useVisualKanbanStore(
    useShallow((state) => ({
      users: state.users,
      projects: state.projects,
      projectMemberships: state.projectMemberships,
      permissions: state.permissions,
      tasks: state.tasks,
      kanbanTasks: state.kanbanTasks,
      personalTodos: state.personalTodos,
      currentUserId: state.currentUserId,
      recentProjectIdByAccountId: state.recentProjectIdByAccountId,
      connectedUserIds: state.connectedUserIds,
      toggleTodo: state.toggleTodo,
      cleanupTodos: state.cleanupTodos,
      addProject: state.addProject,
      setRecentProjectForCurrentAccount: state.setRecentProjectForCurrentAccount
    }))
  );

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);

  const readableProjects = useMemo(() => {
    if (!currentUser) return [];

    return projects.filter((project) => {
      const role = getEffectiveRoleForFeature({
        user: currentUser,
        projectId: project.id,
        feature: "project",
        permissions,
        projectMemberships,
        projects
      });
      return canRead(role);
    });
  }, [currentUser, permissions, projectMemberships, projects]);

  const selectedProjectId = currentUserId ? (selectedProjectIdByAccountId[currentUserId] ?? "") : "";
  const recentProjectId = currentUserId ? (recentProjectIdByAccountId[currentUserId] ?? "") : "";

  const setSelectedProjectForCurrentAccount = useCallback(
    (projectId: string) => {
      if (!currentUserId) return;
      setSelectedProjectIdByAccountId((previous) =>
        previous[currentUserId] === projectId
          ? previous
          : {
              ...previous,
              [currentUserId]: projectId
            }
      );
    },
    [currentUserId]
  );

  const effectiveProjectId = useMemo(() => {
    if (readableProjects.some((item) => item.id === selectedProjectId)) {
      return selectedProjectId;
    }
    if (recentProjectId && readableProjects.some((item) => item.id === recentProjectId)) {
      return recentProjectId;
    }
    return readableProjects[0]?.id ?? "";
  }, [readableProjects, recentProjectId, selectedProjectId]);

  const project = useMemo(
    () => readableProjects.find((item) => item.id === effectiveProjectId) ?? readableProjects[0] ?? null,
    [effectiveProjectId, readableProjects]
  );

  const weekStart = useMemo(() => startOfWeekMonday(new Date()), []);
  const weekEnd = useMemo(() => endOfWeekSunday(new Date()), []);

  const kanbanRole = useMemo(() => {
    if (!project) return "none" as const;
    return getEffectiveRoleForFeature({
      user: currentUser,
      projectId: project.id,
      feature: "kanban",
      permissions,
      projectMemberships,
      projects
    });
  }, [currentUser, permissions, project, projectMemberships, projects]);

  const ganttRole = useMemo(() => {
    if (!project) return "none" as const;
    return getEffectiveRoleForFeature({
      user: currentUser,
      projectId: project.id,
      feature: "gantt",
      permissions,
      projectMemberships,
      projects
    });
  }, [currentUser, permissions, project, projectMemberships, projects]);

  const myTodos = useMemo(() => {
    if (!currentUserId) return [];
    return personalTodos.filter((todo) => todo.ownerId === currentUserId).sort(todoSort).slice(0, 10);
  }, [currentUserId, personalTodos]);

  const kanbanSummary = useMemo(() => {
    if (!project || !currentUser || !canRead(kanbanRole)) {
      return { backlog: 0, todo: 0, inProgress: 0, myAssignedOrParticipant: 0 };
    }

    const visible = kanbanTasks
      .filter((task) => task.projectId === project.id)
      .filter((task) => canSeeTask(currentUser, task, kanbanRole));

    let backlog = 0;
    let todo = 0;
    let inProgress = 0;
    let myAssignedOrParticipant = 0;

    for (const task of visible) {
      const stage = readKanbanStage(task);
      if (stage === "backlog") backlog += 1;
      if (stage === "todo") todo += 1;
      if (stage === "in_progress") inProgress += 1;

      const isMyTask = task.assigneeId === currentUser.id || (task.participantIds ?? []).includes(currentUser.id);
      if (isMyTask) {
        myAssignedOrParticipant += 1;
      }
    }

    return { backlog, todo, inProgress, myAssignedOrParticipant };
  }, [currentUser, kanbanRole, kanbanTasks, project]);

  const weeklyGanttRows = useMemo(() => {
    if (!project || !currentUser || !canRead(ganttRole)) return [];

    return tasks
      .filter((task) => task.projectId === project.id)
      .filter((task) => canSeeTask(currentUser, task, ganttRole))
      .filter((task) => overlapsWeek(task, weekStart, weekEnd))
      .map((task) => ({
        task,
        ...taskRange(task)
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [currentUser, ganttRole, project, tasks, weekEnd, weekStart]);

  const connectedEditors = useMemo(() => {
    if (!project) return [];

    return connectedUserIds
      .map((id) => users.find((user) => user.id === id))
      .filter((user): user is (typeof users)[number] => Boolean(user))
      .filter((user) => {
        if (user.baseRole === "admin") return true;
        return tasks.some((task) =>
          task.projectId === project.id &&
          (task.assigneeId === user.id || task.ownerId === user.id || task.reporterId === user.id || (task.participantIds ?? []).includes(user.id))
        );
      });
  }, [connectedUserIds, project, tasks, users]);

  useEffect(() => {
    if (!currentUserId) return;
    cleanupTodos();
  }, [cleanupTodos, currentUserId]);

  useEffect(() => {
    if (!projectPopupOpen) return;

    const onClickAway = (event: MouseEvent) => {
      if (!projectPopupRef.current?.contains(event.target as Node)) {
        setProjectPopupOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProjectPopupOpen(false);
      }
    };

    window.addEventListener("mousedown", onClickAway);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("mousedown", onClickAway);
      window.removeEventListener("keydown", onEscape);
    };
  }, [projectPopupOpen]);

  const handleToggleTodo = useCallback(
    (todoId: string) => {
      const target = myTodos.find((todo) => todo.id === todoId);
      const result = toggleTodo(todoId);
      if (!result.ok) {
        toast.error(result.reason ?? "To do 상태 변경 실패");
        return;
      }
      toast.success(target?.completed ? "To do를 다시 활성화했습니다." : "To do 완료 처리됨");
    },
    [myTodos, toggleTodo]
  );

  const handleAddProject = useCallback(() => {
    const name = newProjectName.trim();
    if (!name) {
      toast.error("프로젝트명을 입력해 주세요.");
      return;
    }

    const result = addProject({ name, description: "" });
    if (!result.ok || !result.projectId) {
      toast.error(result.reason ?? "프로젝트 추가에 실패했습니다.");
      return;
    }

    setNewProjectName("");
    setSelectedProjectForCurrentAccount(result.projectId);
    setRecentProjectForCurrentAccount(result.projectId);
    setProjectPopupOpen(false);
    toast.success(`\"${name}\" 프로젝트를 추가했습니다.`);
  }, [addProject, newProjectName, setRecentProjectForCurrentAccount, setSelectedProjectForCurrentAccount]);

  if (!currentUser) {
    return (
      <Card className={`${neoCard} p-8`}>
        <CardTitle>세션 확인 중...</CardTitle>
        <CardDescription className="mt-2">로그인 사용자 정보를 불러오고 있습니다.</CardDescription>
      </Card>
    );
  }

  if (!project) {
    return (
      <Card className={`${neoCard} p-8`}>
        <CardTitle>사용 가능한 프로젝트가 없습니다</CardTitle>
        <CardDescription className="mt-2">프로젝트를 추가하거나 권한을 확인해 주세요.</CardDescription>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-zinc-900 bg-white px-2.5 py-2 shadow-[3px_3px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[3px_3px_0_0_rgb(0,0,0)]">
        <Button
          size="sm"
          variant={projectPopupOpen ? "secondary" : "outline"}
          className={cn("h-7 max-w-[260px] gap-1 px-2 text-xs", TOOLBAR_CONTROL_CLASS)}
          onClick={() => setProjectPopupOpen((previous) => !previous)}
          title="프로젝트 선택/추가"
          aria-label="프로젝트 선택/추가"
        >
          <FolderKanban className="h-3.5 w-3.5" />
          <span className="truncate">{project.name}</span>
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {connectedEditors.map((user) => (
            <span
              key={`dash-connected-${user.id}`}
              title={`${user.displayName} 참여중`}
              className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-zinc-900 bg-amber-100 px-1 text-[10px] font-black text-zinc-900 shadow-[2px_2px_0_0_#111827]"
            >
              {(user.icon ?? user.displayName.slice(0, 1).toUpperCase()).slice(0, 4)}
            </span>
          ))}
        </div>

        {projectPopupOpen ? (
          <div
            ref={projectPopupRef}
            className="absolute left-0 top-full z-40 mt-2 w-[340px] rounded-2xl border-2 border-zinc-900 bg-white p-3 shadow-[6px_6px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[6px_6px_0_0_rgb(0,0,0)]"
          >
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">프로젝트 목록</p>
            <div className="mt-2 max-h-40 space-y-2 overflow-auto pr-1">
              {readableProjects.map((candidate) => {
                const active = candidate.id === project.id;
                return (
                  <Button
                    key={candidate.id}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-8 w-full justify-start gap-2 px-2 text-xs"
                    onClick={() => {
                      setSelectedProjectForCurrentAccount(candidate.id);
                      setRecentProjectForCurrentAccount(candidate.id);
                      setProjectPopupOpen(false);
                    }}
                  >
                    <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{candidate.name}</span>
                  </Button>
                );
              })}
            </div>

            <div className="mt-3 border-t-2 border-zinc-200 pt-3 dark:border-zinc-700">
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">프로젝트 추가</p>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="프로젝트명"
                  className="h-8 text-xs"
                />
                <Button type="button" size="sm" className="h-8 px-2 text-xs" onClick={handleAddProject}>
                  추가
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className={neoCard}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <CardTitle>To do</CardTitle>
              <CardDescription>To do 페이지와 연동된 개인 할 일 요약</CardDescription>
            </div>
            <Button size="sm" variant="outline" className={TOOLBAR_CONTROL_CLASS} onClick={() => router.push("/app/todo")}>
              <ListTodo className="h-4 w-4" />
              To do 열기
            </Button>
          </div>

          {myTodos.length === 0 ? (
            <CardDescription>등록된 To do가 없습니다.</CardDescription>
          ) : (
            <div className="space-y-2">
              {myTodos.map((todo) => (
                <label
                  key={todo.id}
                  className="flex items-center gap-3 rounded-xl border-2 border-zinc-900 bg-zinc-100 p-2.5 shadow-[2px_2px_0_0_rgb(24,24,27)]"
                  style={{ borderLeft: `4px solid ${todo.recurrence.type === "none" ? "transparent" : todo.repeatColor}` }}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-2 border-zinc-900"
                    checked={todo.completed}
                    onChange={() => handleToggleTodo(todo.id)}
                  />
                  <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", todo.completed && "line-through text-zinc-500")}>
                    {todo.description ? `${todo.title} — ${todo.description}` : todo.title}
                  </span>
                  <Badge variant={todo.priority <= 2 ? "danger" : todo.priority <= 4 ? "warning" : "info"}>P{todo.priority}</Badge>
                </label>
              ))}
            </div>
          )}
        </Card>

        <Card className={neoCard}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <CardTitle>칸반보드 요약</CardTitle>
              <CardDescription>현재 프로젝트 기준 Backlog/To do/In Progress 및 내 참여 건수</CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              className={TOOLBAR_CONTROL_CLASS}
              onClick={() => router.push(`/app/projects/${project.id}/kanban`)}
            >
              <SquareKanban className="h-4 w-4" />
              칸반보드 열기
            </Button>
          </div>

          {!canRead(kanbanRole) ? (
            <CardDescription>현재 계정은 이 프로젝트의 칸반보드 보기 권한이 없습니다.</CardDescription>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border-2 border-zinc-900 bg-zinc-100 p-3 shadow-[2px_2px_0_0_rgb(24,24,27)]">
                <p className="text-xs text-zinc-500">Backlog</p>
                <p className="text-xl font-semibold">{kanbanSummary.backlog}</p>
              </div>
              <div className="rounded-xl border-2 border-zinc-900 bg-zinc-100 p-3 shadow-[2px_2px_0_0_rgb(24,24,27)]">
                <p className="text-xs text-zinc-500">To do</p>
                <p className="text-xl font-semibold">{kanbanSummary.todo}</p>
              </div>
              <div className="rounded-xl border-2 border-zinc-900 bg-zinc-100 p-3 shadow-[2px_2px_0_0_rgb(24,24,27)]">
                <p className="text-xs text-zinc-500">In Progress</p>
                <p className="text-xl font-semibold">{kanbanSummary.inProgress}</p>
              </div>
              <div className="rounded-xl border-2 border-zinc-900 bg-zinc-100 p-3 shadow-[2px_2px_0_0_rgb(24,24,27)]">
                <p className="text-xs text-zinc-500">나의 담당+참여</p>
                <p className="text-xl font-semibold">{kanbanSummary.myAssignedOrParticipant}</p>
              </div>
            </div>
          )}
        </Card>
      </section>

      <Card className={neoCard}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <CardTitle>간트차트 (이번주)</CardTitle>
            <CardDescription>선택 프로젝트에서 이번 주 진행 대상만 요약 표시 · 상세 수정은 간트차트 페이지에서 수행</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="info">
              <CalendarDays className="mr-1 h-3.5 w-3.5" />
              {formatShortDate(weekStart)} ~ {formatShortDate(weekEnd)}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className={TOOLBAR_CONTROL_CLASS}
              onClick={() => router.push(`/app/projects/${project.id}/gantt`)}
            >
              간트차트 열기
            </Button>
          </div>
        </div>

        {!canRead(ganttRole) ? (
          <CardDescription>현재 계정은 이 프로젝트의 간트차트 보기 권한이 없습니다.</CardDescription>
        ) : weeklyGanttRows.length === 0 ? (
          <CardDescription>이번 주 진행 대상 작업이 없습니다.</CardDescription>
        ) : (
          <div className="space-y-2">
            {weeklyGanttRows.map(({ task, start, end }) => {
              const clippedStart = start < weekStart ? weekStart : start;
              const clippedEnd = end > weekEnd ? weekEnd : end;
              const left = Math.max(0, (dayDiff(weekStart, clippedStart) / 7) * 100);
              const width = Math.max(8, ((dayDiff(clippedStart, clippedEnd) + 1) / 7) * 100);

              return (
                <div
                  key={task.id}
                  className="group rounded-xl border-2 border-zinc-900 bg-zinc-100 p-3 shadow-[2px_2px_0_0_rgb(24,24,27)] transition hover:-translate-y-0.5 hover:shadow-none"
                  onDoubleClick={() => router.push(`/app/projects/${project.id}/gantt`)}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <span className="text-xs text-zinc-500">
                      {formatShortDate(start)} ~ {formatShortDate(end)}
                    </span>
                  </div>

                  <div className="relative h-3 rounded-full border border-zinc-900 bg-zinc-200">
                    <div className="absolute top-0 h-3 rounded-full bg-gradient-to-r from-sky-400 to-violet-500" style={{ left: `${left}%`, width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
