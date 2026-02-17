"use client";

import { useMemo, useState } from "react";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCurrentUser, useVisualKanbanStore } from "@/lib/store";
import type { Activity } from "@/lib/types";
import { useShallow } from "zustand/react/shallow";

const activityLabels: Record<Activity["type"], string> = {
  login: "Login",
  task_move: "Task Move",
  comment_add: "Comment",
  permission_change: "Permission",
  task_create: "Task Create"
};

type TypeFilter = "all" | Activity["type"];

function activityBadge(type: Activity["type"]) {
  if (type === "permission_change") return "danger";
  if (type === "task_move") return "info";
  if (type === "comment_add") return "warning";
  if (type === "task_create") return "success";
  return "neutral";
}

export default function AdminAuditPage() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const { users, currentUserId, activities } = useVisualKanbanStore(useShallow((state) => ({
    users: state.users,
    currentUserId: state.currentUserId,
    activities: state.activities
  })));

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);
  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return activities.filter((activity) => {
      if (typeFilter !== "all" && activity.type !== typeFilter) return false;
      if (!normalized) return true;

      const actor = userMap.get(activity.actorId);
      const actorText = `${actor?.displayName ?? ""} ${actor?.username ?? ""}`.toLowerCase();
      return activity.message.toLowerCase().includes(normalized) || actorText.includes(normalized);
    });
  }, [activities, query, typeFilter, userMap]);

  const counts = useMemo(
    () =>
      activities.reduce<Record<Activity["type"], number>>(
        (acc, activity) => {
          acc[activity.type] += 1;
          return acc;
        },
        {
          login: 0,
          task_move: 0,
          comment_add: 0,
          permission_change: 0,
          task_create: 0
        }
      ),
    [activities]
  );

  if (!currentUser || currentUser.baseRole !== "admin") {
    return <FeatureAccessDenied feature="Audit Log" message="감사 로그는 관리자 전용입니다." />;
  }

  return (
    <section className="space-y-4">
      <PageHeader title="Admin · Audit" description="활동 로그를 타입/검색어로 필터링해 빠르게 추적할 수 있습니다." role={currentUser.baseRole} />

      <div className="grid gap-4 md:grid-cols-5">
        {(Object.keys(activityLabels) as Activity["type"][]).map((type) => (
          <Card key={type}>
            <CardTitle className="text-xs uppercase tracking-wide text-zinc-500">{activityLabels[type]}</CardTitle>
            <p className="mt-2 text-2xl font-semibold">{counts[type]}</p>
          </Card>
        ))}
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full max-w-sm">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="actor / message 검색" />
          </div>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
            className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="all">All Types</option>
            {(Object.keys(activityLabels) as Activity["type"][]).map((type) => (
              <option key={type} value={type}>
                {activityLabels[type]}
              </option>
            ))}
          </select>
        </div>

        <CardDescription>{filtered.length}개의 로그가 필터 조건에 매칭되었습니다.</CardDescription>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">Time</th>
                <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">Actor</th>
                <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">Type</th>
                <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">Message</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((activity) => {
                const actor = userMap.get(activity.actorId);
                return (
                  <tr key={activity.id} className="odd:bg-zinc-50/70 dark:odd:bg-zinc-900/40">
                    <td className="border-b border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      {new Date(activity.createdAt).toLocaleString("ko-KR")}
                    </td>
                    <td className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                      {actor?.displayName ?? activity.actorId}
                    </td>
                    <td className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
                      <Badge variant={activityBadge(activity.type)}>{activityLabels[activity.type]}</Badge>
                    </td>
                    <td className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">{activity.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 ? <p className="p-3 text-sm text-zinc-500">조건에 맞는 로그가 없습니다.</p> : null}
        </div>
      </Card>
    </section>
  );
}
