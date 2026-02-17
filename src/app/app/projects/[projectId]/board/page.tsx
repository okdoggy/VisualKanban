"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Table2 } from "lucide-react";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { canRead, canSeeTask, canWrite } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, useVisualKanbanStore } from "@/lib/store";
import type { TaskPriority, TaskStatus } from "@/lib/types";
import { useShallow } from "zustand/react/shallow";

const statuses: TaskStatus[] = ["backlog", "in_progress", "done"];

const statusLabel: Record<TaskStatus, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  done: "Done"
};

const priorityVariant: Record<TaskPriority, "danger" | "warning" | "info"> = {
  high: "danger",
  medium: "warning",
  low: "info"
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

export default function ProjectBoardPage() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectIdParam = params?.projectId;
  const projectId = Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam;

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const { users, projects, tasks, permissions, currentUserId, moveTask } = useVisualKanbanStore(useShallow((state) => ({
    users: state.users,
    projects: state.projects,
    tasks: state.tasks,
    permissions: state.permissions,
    currentUserId: state.currentUserId,
    moveTask: state.moveTask
  })));

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);

  const project = useMemo(() => projects.find((item) => item.id === projectId) ?? null, [projectId, projects]);

  const role = useMemo(() => {
    if (!project) return "none" as const;
    return getEffectiveRoleForFeature({
      user: currentUser,
      projectId: project.id,
      feature: "taskboard",
      permissions
    });
  }, [currentUser, permissions, project]);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const projectTasks = useMemo(() => {
    if (!project) return [];

    const needle = query.trim().toLowerCase();

    return tasks
      .filter((task) => task.projectId === project.id)
      .filter((task) => canSeeTask(currentUser, task, role))
      .filter((task) => (statusFilter === "all" ? true : task.status === statusFilter))
      .filter((task) => {
        if (!needle) return true;
        return task.title.toLowerCase().includes(needle) || task.description.toLowerCase().includes(needle);
      })
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
  }, [currentUser, project, query, role, statusFilter, tasks]);

  const writable = canWrite(role);

  const updateStatus = (taskId: string, nextStatus: TaskStatus) => {
    if (!writable) {
      setFeedback({ tone: "error", message: "Viewer role is read-only. Status updates require editor/admin." });
      return;
    }

    const result = moveTask(taskId, nextStatus);
    if (!result.ok) {
      setFeedback({ tone: "error", message: result.reason ?? "Could not change task status." });
      return;
    }

    setFeedback({ tone: "success", message: `Task moved to ${statusLabel[nextStatus]}.` });
  };

  if (!currentUser) {
    return (
      <Card className="p-8">
        <CardTitle>Loading task board…</CardTitle>
        <CardDescription className="mt-2">Preparing table view and role-aware actions.</CardDescription>
      </Card>
    );
  }

  if (!projectId || !project) {
    return (
      <Card className="p-8">
        <CardTitle>Project not found</CardTitle>
        <CardDescription className="mt-2">Check the project route and try again.</CardDescription>
      </Card>
    );
  }

  if (!canRead(role)) {
    return (
      <>
        <PageHeader title="Task Board" description={`${project.name} table view`} role={role.toUpperCase()} />
        <FeatureAccessDenied feature="Task Board" />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Task Board"
        description={`${project.name} · table/list view with inline workflow controls.`}
        role={role.toUpperCase()}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => router.push(`/app/projects/${project.id}/kanban`)}>
              <Table2 className="h-4 w-4" />
              Open Kanban
            </Button>
          </div>
        }
      />

      {!writable ? (
        <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30">
          <CardTitle className="text-amber-800 dark:text-amber-300">Read-only mode</CardTitle>
          <CardDescription className="mt-1 text-amber-700 dark:text-amber-400">
            You can open details, but only editor/admin roles can change statuses.
          </CardDescription>
        </Card>
      ) : null}

      {feedback ? (
        <Card className={feedback.tone === "success" ? "border-emerald-200 bg-emerald-50/70" : "border-rose-200 bg-rose-50/70"}>
          <CardDescription className={feedback.tone === "success" ? "text-emerald-700" : "text-rose-700"}>{feedback.message}</CardDescription>
        </Card>
      ) : null}

      <Card>
        <div className="grid gap-2 lg:grid-cols-[2fr_auto]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter tasks by title or description…"
            aria-label="Filter board tasks"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={statusFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setStatusFilter("all")}>All</Button>
            {statuses.map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(status)}
              >
                {statusLabel[status]}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {projectTasks.length === 0 ? (
          <div className="p-8 text-center">
            <CardTitle>No tasks to display</CardTitle>
            <CardDescription className="mt-2">Adjust filters or create a task to populate the board.</CardDescription>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-zinc-100/70 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
                <tr>
                  <th className="px-4 py-3 text-left">Task</th>
                  <th className="px-4 py-3 text-left">Assignee</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Priority</th>
                  <th className="px-4 py-3 text-left">Due</th>
                </tr>
              </thead>
              <tbody>
                {projectTasks.map((task) => (
                  <tr
                    key={task.id}
                    className="cursor-pointer border-t border-zinc-200 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/60"
                    onClick={() => router.push(`/app/projects/${project.id}/tasks/${task.id}`)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{task.title}</p>
                      <p className="line-clamp-1 text-xs text-zinc-500">{task.description}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{usersById.get(task.assigneeId)?.displayName ?? "Unassigned"}</td>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <select
                        value={task.status}
                        onChange={(event) => updateStatus(task.id, event.target.value as TaskStatus)}
                        disabled={!writable}
                        className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        {statuses.map((status) => (
                          <option key={status} value={status}>
                            {statusLabel[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={priorityVariant[task.priority]}>{task.priority.toUpperCase()}</Badge>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{formatDate(task.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
