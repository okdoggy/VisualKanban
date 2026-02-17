"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, SearchIcon, SquareKanban, UserRound, Wrench } from "lucide-react";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { canRead, canSeeTask, type EffectiveRole } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, useVisualKanbanStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

type SearchType = "tasks" | "comments" | "users" | "projects";

const typeOptions: { key: SearchType; label: string }[] = [
  { key: "tasks", label: "Tasks" },
  { key: "comments", label: "Comments" },
  { key: "users", label: "Users" },
  { key: "projects", label: "Projects" }
];

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(urlQuery);
  const [enabledTypes, setEnabledTypes] = useState<SearchType[]>(["tasks", "comments", "users", "projects"]);

  const { users, projects, tasks, comments, permissions, currentUserId } = useVisualKanbanStore(useShallow((state) => ({
    users: state.users,
    projects: state.projects,
    tasks: state.tasks,
    comments: state.comments,
    permissions: state.permissions,
    currentUserId: state.currentUserId
  })));

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);

  const projectRoles = useMemo(() => {
    const roles = new Map<string, EffectiveRole>();
    for (const project of projects) {
      roles.set(
        project.id,
        getEffectiveRoleForFeature({
          user: currentUser,
          projectId: project.id,
          feature: "search",
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

  const primaryRole = useMemo(() => {
    const primaryProject = projects[0];
    if (!primaryProject) return "none";
    return projectRoles.get(primaryProject.id) ?? "none";
  }, [projectRoles, projects]);

  const visibleTasks = useMemo(
    () =>
      tasks
        .filter((task) => readableProjectIds.has(task.projectId))
        .filter((task) => canSeeTask(currentUser, task, projectRoles.get(task.projectId) ?? "none")),
    [currentUser, projectRoles, readableProjectIds, tasks]
  );

  const visibleTaskMap = useMemo(() => new Map(visibleTasks.map((task) => [task.id, task])), [visibleTasks]);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const needle = query.trim().toLowerCase();

  const taskResults = useMemo(() => {
    if (!needle) return [];
    return visibleTasks
      .filter((task) => task.title.toLowerCase().includes(needle) || task.description.toLowerCase().includes(needle) || task.tags.some((tag) => tag.toLowerCase().includes(needle)))
      .slice(0, 15);
  }, [needle, visibleTasks]);

  const commentResults = useMemo(() => {
    if (!needle) return [];
    return comments
      .filter((comment) => {
        const task = visibleTaskMap.get(comment.taskId);
        if (!task) return false;

        const author = usersById.get(comment.authorId);
        return (
          comment.body.toLowerCase().includes(needle) ||
          (author?.displayName.toLowerCase().includes(needle) ?? false) ||
          task.title.toLowerCase().includes(needle)
        );
      })
      .slice(0, 12);
  }, [comments, needle, usersById, visibleTaskMap]);

  const userResults = useMemo(() => {
    if (!needle) return [];
    return users
      .filter((user) => user.displayName.toLowerCase().includes(needle) || user.username.toLowerCase().includes(needle))
      .slice(0, 10);
  }, [needle, users]);

  const projectResults = useMemo(() => {
    if (!needle) return [];
    return projects
      .filter((project) => readableProjectIds.has(project.id))
      .filter((project) => project.name.toLowerCase().includes(needle) || project.description.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [needle, projects, readableProjectIds]);

  const totalResults =
    (enabledTypes.includes("tasks") ? taskResults.length : 0) +
    (enabledTypes.includes("comments") ? commentResults.length : 0) +
    (enabledTypes.includes("users") ? userResults.length : 0) +
    (enabledTypes.includes("projects") ? projectResults.length : 0);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();

    const trimmed = query.trim();
    if (!trimmed) {
      router.replace("/app/search");
      return;
    }

    router.replace(`/app/search?q=${encodeURIComponent(trimmed)}`);
  };

  const toggleType = (type: SearchType) => {
    setEnabledTypes((prev) => (prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]));
  };

  if (!currentUser) {
    return (
      <Card className="p-8">
        <CardTitle>Loading search index…</CardTitle>
        <CardDescription className="mt-2">Gathering tasks, discussions, people, and projects.</CardDescription>
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card className="p-8">
        <CardTitle>No project connected</CardTitle>
        <CardDescription className="mt-2">Search becomes available when at least one project exists.</CardDescription>
      </Card>
    );
  }

  if (readableProjectIds.size === 0) {
    return (
      <>
        <PageHeader title="Search" description="Unified lookup across tasks, comments, users, and projects" role={primaryRole.toUpperCase()} />
        <FeatureAccessDenied feature="Search" />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Search"
        description="Find tasks, comments, teammates, and projects with a single query."
        role={primaryRole.toUpperCase()}
      />

      <Card>
        <form onSubmit={submitSearch} className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-8" placeholder="Try: dashboard, blocker, @admin…" />
            </div>
            <Button type="submit">Search</Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {typeOptions.map((typeOption) => (
              <Button
                key={typeOption.key}
                size="sm"
                variant={enabledTypes.includes(typeOption.key) ? "default" : "outline"}
                onClick={() => toggleType(typeOption.key)}
                type="button"
              >
                {typeOption.label}
              </Button>
            ))}
            <Badge variant="info">{totalResults} matches</Badge>
          </div>
        </form>
      </Card>

      {!needle ? (
        <Card className="p-8 text-center">
          <CardTitle>Start typing to search</CardTitle>
          <CardDescription className="mt-2">Use global keywords, task IDs, @mentions, or project names for faster navigation.</CardDescription>
        </Card>
      ) : totalResults === 0 ? (
        <Card className="p-8 text-center">
          <CardTitle>No results for “{query.trim()}”</CardTitle>
          <CardDescription className="mt-2">Try broader terms or re-enable more result types.</CardDescription>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {enabledTypes.includes("tasks") ? (
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <Wrench className="h-4 w-4 text-sky-500" />
                <CardTitle>Tasks</CardTitle>
                <Badge>{taskResults.length}</Badge>
              </div>
              {taskResults.length === 0 ? (
                <CardDescription>No task matches.</CardDescription>
              ) : (
                <ul className="space-y-2">
                  {taskResults.map((task) => (
                    <li key={task.id}>
                      <Link
                        href={`/app/projects/${task.projectId}/tasks/${task.id}`}
                        className="block rounded-lg border border-zinc-200 p-3 transition hover:border-zinc-400 dark:border-zinc-700"
                      >
                        <p className="text-sm font-medium">{task.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">{task.description}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {enabledTypes.includes("comments") ? (
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-violet-500" />
                <CardTitle>Comments</CardTitle>
                <Badge>{commentResults.length}</Badge>
              </div>
              {commentResults.length === 0 ? (
                <CardDescription>No comment matches.</CardDescription>
              ) : (
                <ul className="space-y-2">
                  {commentResults.map((comment) => {
                    const task = visibleTaskMap.get(comment.taskId);
                    const author = usersById.get(comment.authorId);
                    if (!task) return null;

                    return (
                      <li key={comment.id}>
                        <Link
                          href={`/app/projects/${task.projectId}/tasks/${task.id}?comment=${comment.id}`}
                          className="block rounded-lg border border-zinc-200 p-3 transition hover:border-zinc-400 dark:border-zinc-700"
                        >
                          <p className="line-clamp-2 text-sm">{comment.body}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {author?.displayName ?? "Unknown"} · {task.title}
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ) : null}

          {enabledTypes.includes("users") ? (
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <UserRound className="h-4 w-4 text-emerald-500" />
                <CardTitle>Users</CardTitle>
                <Badge>{userResults.length}</Badge>
              </div>
              {userResults.length === 0 ? (
                <CardDescription>No user matches.</CardDescription>
              ) : (
                <ul className="space-y-2">
                  {userResults.map((user) => (
                    <li key={user.id}>
                      <Link href={`/app/admin/users?user=${user.id}`} className="block rounded-lg border border-zinc-200 p-3 transition hover:border-zinc-400 dark:border-zinc-700">
                        <p className="text-sm font-medium">{user.displayName}</p>
                        <p className="text-xs text-zinc-500">@{user.username} · {user.baseRole.toUpperCase()}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {enabledTypes.includes("projects") ? (
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <SquareKanban className="h-4 w-4 text-amber-500" />
                <CardTitle>Projects</CardTitle>
                <Badge>{projectResults.length}</Badge>
              </div>
              {projectResults.length === 0 ? (
                <CardDescription>No project matches.</CardDescription>
              ) : (
                <ul className="space-y-2">
                  {projectResults.map((project) => (
                    <li key={project.id}>
                      <Link href={`/app/projects/${project.id}/board`} className="block rounded-lg border border-zinc-200 p-3 transition hover:border-zinc-400 dark:border-zinc-700">
                        <p className="text-sm font-medium">{project.name}</p>
                        <p className="text-xs text-zinc-500">{project.description}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
