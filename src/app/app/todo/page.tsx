"use client";

import { useMemo, useState } from "react";
import { CheckSquare, Filter, ListChecks } from "lucide-react";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { canRead, canSeeTask, canWrite, type EffectiveRole } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, useVisualKanbanStore } from "@/lib/store";
import type { TaskPriority, TaskStatus } from "@/lib/types";
import { useShallow } from "zustand/react/shallow";

type StatusFilter = TaskStatus | "all";
type PriorityFilter = TaskPriority | "all";

const statusFilters: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Backlog", value: "backlog" },
  { label: "In Progress", value: "in_progress" },
  { label: "Done", value: "done" }
];

const priorityFilters: { label: string; value: PriorityFilter }[] = [
  { label: "Any priority", value: "all" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" }
];

const nextStatuses: { label: string; value: TaskStatus }[] = [
  { label: "Move to Backlog", value: "backlog" },
  { label: "Move to In Progress", value: "in_progress" },
  { label: "Move to Done", value: "done" }
];

const priorityVariant: Record<TaskPriority, "danger" | "warning" | "info"> = {
  high: "danger",
  medium: "warning",
  low: "info"
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No due date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

export default function TodoPage() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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

  const projectRoles = useMemo(() => {
    const roles = new Map<string, EffectiveRole>();
    for (const project of projects) {
      roles.set(
        project.id,
        getEffectiveRoleForFeature({
          user: currentUser,
          projectId: project.id,
          feature: "todo",
          permissions
        })
      );
    }
    return roles;
  }, [currentUser, permissions, projects]);

  const readableProjectIds = useMemo(
    () => new Set([...projectRoles.entries()].filter(([, role]) => canRead(role)).map(([projectId]) => projectId)),
    [projectRoles]
  );

  const writableProjectIds = useMemo(
    () => new Set([...projectRoles.entries()].filter(([, role]) => canWrite(role)).map(([projectId]) => projectId)),
    [projectRoles]
  );

  const visibleTasks = useMemo(() => {
    return tasks
      .filter((task) => readableProjectIds.has(task.projectId))
      .filter((task) => canSeeTask(currentUser, task, projectRoles.get(task.projectId) ?? "none"));
  }, [currentUser, projectRoles, readableProjectIds, tasks]);

  const filteredTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return visibleTasks
      .filter((task) => (statusFilter === "all" ? true : task.status === statusFilter))
      .filter((task) => (priorityFilter === "all" ? true : task.priority === priorityFilter))
      .filter((task) => (mineOnly && currentUser ? task.assigneeId === currentUser.id : true))
      .filter((task) => {
        if (!needle) return true;
        return task.title.toLowerCase().includes(needle) || task.description.toLowerCase().includes(needle);
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [currentUser, mineOnly, priorityFilter, query, statusFilter, visibleTasks]);

  const filteredTaskIdSet = useMemo(() => new Set(filteredTasks.map((task) => task.id)), [filteredTasks]);
  const selectedIdsInView = useMemo(() => selectedIds.filter((id) => filteredTaskIdSet.has(id)), [filteredTaskIdSet, selectedIds]);
  const selectedIdSet = useMemo(() => new Set(selectedIdsInView), [selectedIdsInView]);

  const primaryRole = useMemo(() => {
    const primaryProject = projects[0];
    if (!primaryProject) return "none";
    return projectRoles.get(primaryProject.id) ?? "none";
  }, [projectRoles, projects]);

  const toggleSelection = (taskId: string) => {
    setSelectedIds((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]));
  };

  const selectAllWritableInView = () => {
    const ids = filteredTasks.filter((task) => writableProjectIds.has(task.projectId)).map((task) => task.id);
    setSelectedIds(ids);
  };

  const applyBulkStatus = (nextStatus: TaskStatus) => {
    if (selectedIdsInView.length === 0) {
      setFeedback({ tone: "error", message: "Select at least one task to run a bulk update." });
      return;
    }

    let updated = 0;
    let blocked = 0;
    let failed = 0;

    for (const taskId of selectedIdsInView) {
      const task = visibleTasks.find((item) => item.id === taskId);
      if (!task) continue;

      if (!writableProjectIds.has(task.projectId)) {
        blocked += 1;
        continue;
      }

      const result = moveTask(taskId, nextStatus);
      if (result.ok) {
        updated += 1;
      } else {
        failed += 1;
      }
    }

    const message = `${updated} updated, ${blocked} blocked by role, ${failed} failed.`;
    setFeedback({ tone: updated > 0 ? "success" : "error", message });
    if (updated > 0) {
      setSelectedIds((prev) => prev.filter((id) => !selectedIdSet.has(id)));
    }
  };

  if (!currentUser) {
    return (
      <Card className="p-8">
        <CardTitle>Loading TODO workspace…</CardTitle>
        <CardDescription className="mt-2">Pulling your assigned work and team backlog.</CardDescription>
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card className="p-8">
        <CardTitle>No project available</CardTitle>
        <CardDescription className="mt-2">Connect a project first to use TODO planning.</CardDescription>
      </Card>
    );
  }

  if (readableProjectIds.size === 0) {
    return (
      <>
        <PageHeader title="Todo" description="Filter and execute task batches" role={primaryRole.toUpperCase()} />
        <FeatureAccessDenied feature="Todo" />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Todo"
        description="List, filter, multi-select, and execute bulk workflow updates."
        role={primaryRole.toUpperCase()}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={selectAllWritableInView}>
              <CheckSquare className="h-4 w-4" />
              Select writable
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
              Clear selection
            </Button>
          </div>
        }
      />

      {[...writableProjectIds].length === 0 ? (
        <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30">
          <CardTitle className="text-amber-800 dark:text-amber-300">Read-only mode</CardTitle>
          <CardDescription className="mt-1 text-amber-700 dark:text-amber-400">
            You can filter and inspect tasks, but bulk updates require editor/admin access.
          </CardDescription>
        </Card>
      ) : null}

      {feedback ? (
        <Card className={feedback.tone === "success" ? "border-emerald-200 bg-emerald-50/70" : "border-rose-200 bg-rose-50/70"}>
          <CardDescription className={feedback.tone === "success" ? "text-emerald-700" : "text-rose-700"}>{feedback.message}</CardDescription>
        </Card>
      ) : null}

      <Card>
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_auto]">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by title or description…"
            aria-label="Search todos"
          />

          <div className="flex items-center gap-2 overflow-auto">
            {statusFilters.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={statusFilter === option.value ? "default" : "outline"}
                onClick={() => setStatusFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 overflow-auto">
            {priorityFilters.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={priorityFilter === option.value ? "default" : "outline"}
                onClick={() => setPriorityFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <Button variant={mineOnly ? "default" : "outline"} size="sm" onClick={() => setMineOnly((value) => !value)}>
            <Filter className="h-4 w-4" />
            {mineOnly ? "Mine only" : "All assignees"}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <ListChecks className="h-4 w-4" />
            {filteredTasks.length} tasks in view · {selectedIdsInView.length} selected
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {nextStatuses.map((statusOption) => (
              <Button
                key={statusOption.value}
                size="sm"
                variant="secondary"
                onClick={() => applyBulkStatus(statusOption.value)}
                disabled={selectedIdsInView.length === 0}
              >
                {statusOption.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        {filteredTasks.length === 0 ? (
          <div className="py-10 text-center">
            <CardTitle>No tasks match this filter set</CardTitle>
            <CardDescription className="mt-2">Try clearing filters or switching from “Mine only” to see more work.</CardDescription>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => {
              const editable = writableProjectIds.has(task.projectId);
              const selected = selectedIdSet.has(task.id);
              return (
                <label
                  key={task.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                    selected ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800/60" : "border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                    checked={selected}
                    onChange={() => toggleSelection(task.id)}
                    disabled={!editable}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <Badge variant={priorityVariant[task.priority]}>{task.priority.toUpperCase()}</Badge>
                      <Badge variant="neutral">{task.status}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{task.description}</p>
                    <p className="mt-1 text-xs text-zinc-500">Due {formatDate(task.dueDate)} · Project {task.projectId}</p>
                  </div>

                  {!editable ? <Badge variant="warning">Read-only</Badge> : null}
                </label>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
