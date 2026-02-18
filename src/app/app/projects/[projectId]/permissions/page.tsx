"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { canRead } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, useVisualKanbanStore } from "@/lib/store";
import type { AccessRole, FeatureKey } from "@/lib/types";
import { useShallow } from "zustand/react/shallow";

const neoCard =
  "rounded-2xl border-2 border-zinc-900 bg-white shadow-[4px_4px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[4px_4px_0_0_rgb(0,0,0)]";
const neoControl =
  "border-2 border-zinc-900 shadow-[2px_2px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]";

const features: FeatureKey[] = ["project", "kanban", "mindmap", "gantt", "taskboard", "todo", "search", "comments"];
const roles: AccessRole[] = ["admin", "editor", "viewer", "private"];

const featureLabel: Record<FeatureKey, string> = {
  project: "Project",
  kanban: "Kanban",
  mindmap: "WhiteBoard",
  gantt: "Gantt",
  taskboard: "Task Board",
  todo: "Todo",
  search: "Search",
  comments: "Comments"
};

const roleDescription: Record<AccessRole, string> = {
  admin: "프로젝트 전 범위 읽기/쓰기 및 권한 조정 가능",
  editor: "대부분의 편집 작업 가능, 관리 범위는 제한",
  viewer: "기본 권한. 읽기 전용",
  private: "소유자 중심의 제한 접근 (해당 사용자 전용 영역)"
};

function readParam(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function roleVariant(role: AccessRole) {
  if (role === "admin") return "danger";
  if (role === "editor") return "info";
  if (role === "private") return "warning";
  return "neutral";
}

export default function PermissionsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = readParam(params.projectId);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { users, currentUserId, projects, permissions, setPermission } = useVisualKanbanStore(useShallow((state) => ({
    users: state.users,
    currentUserId: state.currentUserId,
    projects: state.projects,
    permissions: state.permissions,
    setPermission: state.setPermission
  })));

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);
  const project = useMemo(() => projects.find((item) => item.id === projectId), [projects, projectId]);

  const projectRole = useMemo(
    () =>
      getEffectiveRoleForFeature({
        user: currentUser,
        projectId,
        feature: "project",
        permissions
      }),
    [currentUser, permissions, projectId]
  );

  const canManage = projectRole === "admin";

  const preferredUserId = useMemo(() => {
    const preferred = users.find((user) => user.baseRole !== "admin") ?? users[0];
    return preferred?.id ?? "";
  }, [users]);

  const effectiveSelectedUserId = useMemo(() => {
    if (selectedUserId && users.some((user) => user.id === selectedUserId)) return selectedUserId;
    return preferredUserId;
  }, [preferredUserId, selectedUserId, users]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === effectiveSelectedUserId) ?? null,
    [effectiveSelectedUserId, users]
  );

  const assignmentMap = useMemo(
    () =>
      new Map(
        permissions
          .filter((perm) => perm.projectId === projectId && perm.userId === effectiveSelectedUserId)
          .map((perm) => [perm.feature, perm])
      ),
    [effectiveSelectedUserId, permissions, projectId]
  );

  if (!canRead(projectRole)) {
    return <FeatureAccessDenied feature="Permissions" />;
  }

  if (!project) {
    return (
      <Card className={neoCard}>
        <CardTitle>프로젝트를 찾을 수 없습니다.</CardTitle>
        <CardDescription className="mt-1">잘못된 프로젝트 ID입니다: {projectId}</CardDescription>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title={`${project.name} Permissions`}
        description="선택한 사용자 기준으로 기능별 권한을 부여합니다. 명시되지 않은 권한은 Viewer로 동작합니다."
        role={projectRole}
        actions={
          <label className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500 dark:text-zinc-300">사용자</span>
            <select
              value={effectiveSelectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className={`h-9 rounded-md bg-white px-2 text-sm dark:bg-zinc-900 ${neoControl}`}
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} ({user.username})
                </option>
              ))}
            </select>
          </label>
        }
      />

      <Card className={neoCard}>
        <CardTitle>Role Guide</CardTitle>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {roles.map((role) => (
            <div
              key={role}
              className="rounded-xl border-2 border-zinc-900 bg-zinc-50 p-3 shadow-[2px_2px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-800/60 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]"
            >
              <div className="flex items-center gap-2">
                <Badge variant={roleVariant(role)}>{role.toUpperCase()}</Badge>
                <span className="text-sm font-medium">{roleDescription[role]}</span>
              </div>
            </div>
          ))}
        </div>
        <CardDescription className="mt-3">기본값은 Viewer입니다. 필요할 때만 더 높은 권한을 부여하세요.</CardDescription>
      </Card>

      <Card className={`${neoCard} overflow-hidden p-0`}>
        <div className="grid grid-cols-[1.1fr_1fr_1fr] border-b-2 border-zinc-900 bg-zinc-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:border-zinc-100 dark:bg-zinc-800 dark:text-zinc-200">
          <span>Feature</span>
          <span>Assigned Role</span>
          <span>Status</span>
        </div>

        {features.map((feature) => {
          const assignment = assignmentMap.get(feature);
          const role = assignment?.role ?? "viewer";
          const updatedAt = assignment?.updatedAt ? new Date(assignment.updatedAt).toLocaleString("ko-KR") : "기본값";

          return (
            <div
              key={feature}
              className="grid grid-cols-[1.1fr_1fr_1fr] items-center gap-3 border-b border-zinc-300/90 px-4 py-3 text-sm last:border-b-0 dark:border-zinc-700/90"
            >
              <div>
                <p className="font-medium">{featureLabel[feature]}</p>
                <p className="text-xs text-zinc-500">키: {feature}</p>
              </div>

              <label className="inline-flex items-center gap-2">
                <select
                  value={role}
                  disabled={!canManage || !selectedUser}
                  onChange={(event) => {
                    if (!selectedUser) return;
                    setPermission(projectId, feature, selectedUser.id, event.target.value as AccessRole);
                  }}
                  className={`h-9 rounded-md bg-white px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-900 ${neoControl}`}
                >
                  {roles.map((option) => (
                    <option key={option} value={option}>
                      {option.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-1">
                <Badge variant={roleVariant(role)}>{role.toUpperCase()}</Badge>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{updatedAt}</p>
              </div>
            </div>
          );
        })}
      </Card>

      {!canManage ? (
        <Card className={`${neoCard} border-amber-700 bg-amber-100 dark:border-amber-400 dark:bg-amber-950/50`}>
          <CardDescription>현재 계정은 읽기 전용입니다. 권한 변경은 Admin 권한이 필요합니다.</CardDescription>
        </Card>
      ) : null}

      {selectedUser ? (
        <Card className={neoCard}>
          <CardDescription>
            현재 대상 사용자: <span className="font-medium">{selectedUser.displayName}</span> ({selectedUser.username})
          </CardDescription>
        </Card>
      ) : null}
    </section>
  );
}
