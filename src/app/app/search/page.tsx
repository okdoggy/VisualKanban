"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange, ListTodo, SearchIcon, SquareKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { canRead, canSeeTask, type EffectiveRole } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, getVisiblePersonalTodos, useVisualKanbanStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

const neoCard =
  "rounded-2xl border-2 border-zinc-900 bg-white shadow-[4px_4px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[4px_4px_0_0_rgb(0,0,0)]";
const neoButton =
  "border-2 border-zinc-900 shadow-[2px_2px_0_0_rgb(24,24,27)] transition hover:-translate-y-0.5 hover:shadow-none dark:border-zinc-100 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]";
const resultItemClass =
  "block rounded-lg border-2 border-zinc-900 bg-zinc-100 p-3 shadow-[2px_2px_0_0_rgb(24,24,27)] transition hover:-translate-y-0.5 hover:shadow-none dark:border-zinc-100 dark:bg-zinc-800/60 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]";

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(urlQuery);

  const { users, projects, projectMemberships, tasks, kanbanTasks, personalTodos, permissions, currentUserId } = useVisualKanbanStore(
    useShallow((state) => ({
      users: state.users,
      projects: state.projects,
      projectMemberships: state.projectMemberships,
      tasks: state.tasks,
      kanbanTasks: state.kanbanTasks,
      personalTodos: state.personalTodos,
      permissions: state.permissions,
      currentUserId: state.currentUserId
    }))
  );

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);

  const kanbanRolesByProject = useMemo(() => {
    const roles = new Map<string, EffectiveRole>();
    for (const project of projects) {
      roles.set(
        project.id,
        getEffectiveRoleForFeature({
          user: currentUser,
          projectId: project.id,
          feature: "kanban",
          permissions,
          projectMemberships,
          projects
        })
      );
    }
    return roles;
  }, [currentUser, permissions, projectMemberships, projects]);

  const ganttRolesByProject = useMemo(() => {
    const roles = new Map<string, EffectiveRole>();
    for (const project of projects) {
      roles.set(
        project.id,
        getEffectiveRoleForFeature({
          user: currentUser,
          projectId: project.id,
          feature: "gantt",
          permissions,
          projectMemberships,
          projects
        })
      );
    }
    return roles;
  }, [currentUser, permissions, projectMemberships, projects]);

  const projectNameById = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);

  const visibleTodos = useMemo(
    () =>
      getVisiblePersonalTodos({
        todos: personalTodos,
        currentUserId
      }),
    [currentUserId, personalTodos]
  );

  const visibleKanbanTasks = useMemo(() => {
    if (!currentUser) return [];

    return kanbanTasks.filter((task) => {
      const role = kanbanRolesByProject.get(task.projectId) ?? "none";
      if (!canRead(role)) return false;
      return canSeeTask(currentUser, task, role);
    });
  }, [currentUser, kanbanRolesByProject, kanbanTasks]);

  const visibleGanttTasks = useMemo(() => {
    if (!currentUser) return [];

    return tasks.filter((task) => {
      const role = ganttRolesByProject.get(task.projectId) ?? "none";
      if (!canRead(role)) return false;
      return canSeeTask(currentUser, task, role);
    });
  }, [currentUser, ganttRolesByProject, tasks]);

  const needle = query.trim().toLowerCase();

  const todoResults = useMemo(() => {
    if (!needle) return [];
    return visibleTodos
      .filter((todo) => todo.title.toLowerCase().includes(needle) || todo.description.toLowerCase().includes(needle))
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, 15);
  }, [needle, visibleTodos]);

  const kanbanResults = useMemo(() => {
    if (!needle) return [];
    return visibleKanbanTasks
      .filter((task) => {
        return (
          task.title.toLowerCase().includes(needle) ||
          task.description.toLowerCase().includes(needle) ||
          task.tags.some((tag) => tag.toLowerCase().includes(needle))
        );
      })
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, 15);
  }, [needle, visibleKanbanTasks]);

  const ganttResults = useMemo(() => {
    if (!needle) return [];
    return visibleGanttTasks
      .filter((task) => {
        return (
          task.title.toLowerCase().includes(needle) ||
          task.description.toLowerCase().includes(needle) ||
          task.tags.some((tag) => tag.toLowerCase().includes(needle))
        );
      })
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, 15);
  }, [needle, visibleGanttTasks]);

  const totalResults = todoResults.length + kanbanResults.length + ganttResults.length;

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();

    const trimmed = query.trim();
    if (!trimmed) {
      router.replace("/app/search");
      return;
    }

    router.replace(`/app/search?q=${encodeURIComponent(trimmed)}`);
  };

  if (!currentUser) {
    return (
      <Card className={`${neoCard} p-8`}>
        <CardTitle>Loading search index…</CardTitle>
        <CardDescription className="mt-2">Gathering your To do, Kanban, and Gantt content.</CardDescription>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className={neoCard}>
        <form onSubmit={submitSearch} className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="border-2 border-zinc-900 pl-8 shadow-[2px_2px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]"
                placeholder="Search To do, Kanban, and Gantt..."
              />
            </div>
            <Button className={neoButton} type="submit">
              Search
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="info">{totalResults} matches</Badge>
          </div>
        </form>
      </Card>

      {!needle ? (
        <Card className={`${neoCard} p-8 text-center`}>
          <CardTitle>Start typing to search</CardTitle>
          <CardDescription className="mt-2">Search is scoped to your To do, readable Kanban tasks, and readable Gantt tasks.</CardDescription>
        </Card>
      ) : totalResults === 0 ? (
        <Card className={`${neoCard} p-8 text-center`}>
          <CardTitle>No results for “{query.trim()}”</CardTitle>
          <CardDescription className="mt-2">Try broader keywords for To do, Kanban, or Gantt content.</CardDescription>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className={neoCard}>
            <div className="mb-3 flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-emerald-500" />
              <CardTitle>To do</CardTitle>
              <Badge>{todoResults.length}</Badge>
            </div>
            {todoResults.length === 0 ? (
              <CardDescription>No To do matches.</CardDescription>
            ) : (
              <ul className="space-y-2">
                {todoResults.map((todo) => (
                  <li key={todo.id}>
                    <Link href="/app/todo" className={resultItemClass}>
                      <p className="text-sm font-medium">{todo.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">{todo.description || "No description"}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className={neoCard}>
            <div className="mb-3 flex items-center gap-2">
              <SquareKanban className="h-4 w-4 text-sky-500" />
              <CardTitle>Kanban</CardTitle>
              <Badge>{kanbanResults.length}</Badge>
            </div>
            {kanbanResults.length === 0 ? (
              <CardDescription>No Kanban matches.</CardDescription>
            ) : (
              <ul className="space-y-2">
                {kanbanResults.map((task) => (
                  <li key={task.id}>
                    <Link href={`/app/projects/${task.projectId}/kanban`} className={resultItemClass}>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {(projectNameById.get(task.projectId) ?? task.projectId) + " · " + task.description}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className={neoCard}>
            <div className="mb-3 flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-violet-500" />
              <CardTitle>Gantt</CardTitle>
              <Badge>{ganttResults.length}</Badge>
            </div>
            {ganttResults.length === 0 ? (
              <CardDescription>No Gantt matches.</CardDescription>
            ) : (
              <ul className="space-y-2">
                {ganttResults.map((task) => (
                  <li key={task.id}>
                    <Link href={`/app/projects/${task.projectId}/tasks/${task.id}`} className={resultItemClass}>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {(projectNameById.get(task.projectId) ?? task.projectId) + " · " + task.description}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
