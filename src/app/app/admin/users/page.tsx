"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UserAutocompleteSelect } from "@/components/ui/user-autocomplete";
import { canManageProjectMembers } from "@/lib/permissions/roles";
import { getCurrentUser, useVisualKanbanStore } from "@/lib/store";
import type { ProjectMemberRole, User } from "@/lib/types";
import { useShallow } from "zustand/react/shallow";

const neoCard =
  "rounded-2xl border-2 border-zinc-900 bg-white shadow-[4px_4px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[4px_4px_0_0_rgb(0,0,0)]";
const neoControl =
  "border-2 border-zinc-900 shadow-[2px_2px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]";

const USER_PAGE_SIZE = 12;

const memberRoleWeight: Record<ProjectMemberRole, number> = {
  owner: 3,
  write: 2,
  read: 1
};

function strongerMemberRole(currentRole: ProjectMemberRole | undefined, nextRole: ProjectMemberRole) {
  if (!currentRole) return nextRole;
  return memberRoleWeight[nextRole] > memberRoleWeight[currentRole] ? nextRole : currentRole;
}

export default function AdminUsersPage() {
  const [query, setQuery] = useState("");
  const [userPage, setUserPage] = useState(1);

  const [memberModalProjectId, setMemberModalProjectId] = useState<string | null>(null);
  const [memberCandidateId, setMemberCandidateId] = useState("");
  const [memberCandidateRole, setMemberCandidateRole] = useState<ProjectMemberRole>("read");

  const { users, projects, projectMemberships, currentUserId, setProjectMemberRole, deleteProject } = useVisualKanbanStore(
    useShallow((state) => ({
      users: state.users,
      projects: state.projects,
      projectMemberships: state.projectMemberships,
      currentUserId: state.currentUserId,
      setProjectMemberRole: state.setProjectMemberRole,
      deleteProject: state.deleteProject
    }))
  );

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);

  const memberRolesByProjectId = useMemo(() => {
    const next = new Map<string, Map<string, ProjectMemberRole>>();

    for (const project of projects) {
      const roleMap = new Map<string, ProjectMemberRole>();
      roleMap.set(project.ownerId, "owner");
      next.set(project.id, roleMap);
    }

    for (const membership of projectMemberships) {
      const roleMap = next.get(membership.projectId);
      if (!roleMap) continue;

      const currentRole = roleMap.get(membership.userId);
      roleMap.set(membership.userId, strongerMemberRole(currentRole, membership.role));
    }

    return next;
  }, [projectMemberships, projects]);

  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const membersByProjectId = useMemo(() => {
    const next = new Map<string, Array<{ user: User; role: ProjectMemberRole }>>();

    for (const project of projects) {
      const roleMap = memberRolesByProjectId.get(project.id) ?? new Map<string, ProjectMemberRole>();

      const members = [...roleMap.entries()]
        .map(([userId, role]) => {
          const user = userById.get(userId);
          if (!user) return null;
          return { user, role };
        })
        .filter((item): item is { user: User; role: ProjectMemberRole } => Boolean(item))
        .sort((left, right) => left.user.displayName.localeCompare(right.user.displayName));

      next.set(project.id, members);
    }

    return next;
  }, [memberRolesByProjectId, projects, userById]);

  const projectNamesByUserId = useMemo(() => {
    const next = new Map<string, string[]>();

    for (const project of projects) {
      const members = membersByProjectId.get(project.id) ?? [];
      for (const member of members) {
        const prev = next.get(member.user.id) ?? [];
        next.set(member.user.id, [...prev, project.name]);
      }
    }

    for (const [userId, projectNames] of next.entries()) {
      const deduplicated = [...new Set(projectNames)].sort((left, right) => left.localeCompare(right));
      next.set(userId, deduplicated);
    }

    return next;
  }, [membersByProjectId, projects]);

  const manageableProjectIdSet = useMemo(() => {
    const manageable = new Set<string>();
    if (!currentUser) return manageable;

    for (const project of projects) {
      const canManage = canManageProjectMembers({
        actor: currentUser,
        projectId: project.id,
        projectMemberships,
        projects
      });

      if (canManage) {
        manageable.add(project.id);
      }
    }

    return manageable;
  }, [currentUser, projectMemberships, projects]);
  const deletableProjectIdSet = useMemo(() => {
    const deletable = new Set<string>();
    if (!currentUser) return deletable;

    for (const project of projects) {
      const memberRole = (memberRolesByProjectId.get(project.id) ?? new Map<string, ProjectMemberRole>()).get(currentUser.id);
      if (memberRole === "owner" || memberRole === "write") {
        deletable.add(project.id);
      }
    }

    return deletable;
  }, [currentUser, memberRolesByProjectId, projects]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return users
      .filter((user) => {
        if (!normalized) return true;

        return (
          user.username.toLowerCase().includes(normalized) ||
          user.displayName.toLowerCase().includes(normalized) ||
          (projectNamesByUserId.get(user.id) ?? []).some((projectName) => projectName.toLowerCase().includes(normalized))
        );
      })
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [projectNamesByUserId, query, users]);

  const totalUserPages = Math.max(1, Math.ceil(filteredUsers.length / USER_PAGE_SIZE));
  const effectiveUserPage = Math.min(userPage, totalUserPages);

  const pagedUsers = useMemo(() => {
    const start = (effectiveUserPage - 1) * USER_PAGE_SIZE;
    return filteredUsers.slice(start, start + USER_PAGE_SIZE);
  }, [effectiveUserPage, filteredUsers]);

  const selectedModalProject = useMemo(
    () => (memberModalProjectId ? projects.find((project) => project.id === memberModalProjectId) ?? null : null),
    [memberModalProjectId, projects]
  );

  const selectedModalProjectCanManage = useMemo(() => {
    if (!selectedModalProject) return false;
    return manageableProjectIdSet.has(selectedModalProject.id);
  }, [manageableProjectIdSet, selectedModalProject]);

  const usersNotInSelectedProject = useMemo(() => {
    if (!selectedModalProject) return [];

    const roleMap = memberRolesByProjectId.get(selectedModalProject.id) ?? new Map<string, ProjectMemberRole>();

    return users
      .filter((user) => !roleMap.has(user.id))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [memberRolesByProjectId, selectedModalProject, users]);
  const memberCandidateOptions = useMemo(
    () =>
      usersNotInSelectedProject.map((user) => ({
        id: user.id,
        label: user.displayName,
        secondaryLabel: `@${user.username}`
      })),
    [usersNotInSelectedProject]
  );

  const effectiveMemberCandidateId = useMemo(() => {
    if (usersNotInSelectedProject.some((user) => user.id === memberCandidateId)) {
      return memberCandidateId;
    }
    return usersNotInSelectedProject[0]?.id ?? "";
  }, [memberCandidateId, usersNotInSelectedProject]);

  const openAddMemberModal = (projectId: string) => {
    setMemberModalProjectId(projectId);
    setMemberCandidateId("");
    setMemberCandidateRole("read");
  };

  const closeAddMemberModal = () => {
    setMemberModalProjectId(null);
    setMemberCandidateId("");
    setMemberCandidateRole("read");
  };

  const handleAddMember = () => {
    if (!selectedModalProject || !effectiveMemberCandidateId) {
      return;
    }

    if (!selectedModalProjectCanManage) {
      toast.error("이 프로젝트의 구성원을 추가할 권한이 없습니다.");
      return;
    }

    const result = setProjectMemberRole(selectedModalProject.id, effectiveMemberCandidateId, memberCandidateRole);
    if (!result.ok) {
      toast.error(result.reason ?? "구성원 추가에 실패했습니다.");
      return;
    }

    toast.success("프로젝트 구성원을 추가했습니다.");
    closeAddMemberModal();
  };
  const handleDeleteProject = (projectId: string, projectName: string) => {
    if (!deletableProjectIdSet.has(projectId)) {
      toast.error("해당 프로젝트 참여자(Owner/Write)만 삭제할 수 있습니다.");
      return;
    }

    const shouldDelete = window.confirm(`\"${projectName}\" 프로젝트를 삭제할까요?\\n관련 데이터(태스크/보드)가 함께 제거됩니다.`);
    if (!shouldDelete) return;

    const result = deleteProject(projectId);
    if (!result.ok) {
      toast.error(result.reason ?? "프로젝트 삭제에 실패했습니다.");
      return;
    }

    if (memberModalProjectId === projectId) {
      closeAddMemberModal();
    }

    toast.success("프로젝트를 삭제했습니다.");
  };

  if (!currentUser) {
    return (
      <Card className={neoCard}>
        <CardTitle>세션 확인 중...</CardTitle>
        <CardDescription className="mt-2">로그인 정보를 불러오는 중입니다.</CardDescription>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <Card className={`${neoCard} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>User Directory</CardTitle>
            <CardDescription className="mt-1">검색 + 페이지네이션으로 많은 사용자도 빠르게 확인할 수 있습니다.</CardDescription>
          </div>
          <div className="flex w-full max-w-xl flex-wrap items-center gap-2">
            <Input
              className={`h-10 flex-1 ${neoControl}`}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setUserPage(1);
              }}
              placeholder="이름 / 아이디 / 프로젝트명 검색"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`h-10 px-3 ${neoControl}`}
              onClick={() => setQuery("")}
              disabled={!query}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                <th className="border-b-2 border-zinc-900 px-3 py-2 dark:border-zinc-100">Name</th>
                <th className="border-b-2 border-zinc-900 px-3 py-2 dark:border-zinc-100">Username</th>
                <th className="border-b-2 border-zinc-900 px-3 py-2 dark:border-zinc-100">Projects</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.map((user) => {
                const projectNames = projectNamesByUserId.get(user.id) ?? [];

                return (
                  <tr key={user.id} className="odd:bg-zinc-100/70 dark:odd:bg-zinc-800/40">
                    <td className="border-b border-zinc-300 px-3 py-2 dark:border-zinc-700">{user.displayName}</td>
                    <td className="border-b border-zinc-300 px-3 py-2 font-mono text-xs dark:border-zinc-700">@{user.username}</td>
                    <td className="border-b border-zinc-300 px-3 py-2 dark:border-zinc-700">
                      {projectNames.length === 0 ? (
                        <span className="text-xs text-zinc-500">참여 프로젝트 없음</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {projectNames.map((projectName) => (
                            <span
                              key={`${user.id}-${projectName}`}
                              className="inline-flex items-center rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                            >
                              {projectName}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pagedUsers.length === 0 ? <p className="p-3 text-sm text-zinc-500">검색 결과가 없습니다.</p> : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-300 pt-3 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
          <span>
            Showing {filteredUsers.length === 0 ? 0 : (effectiveUserPage - 1) * USER_PAGE_SIZE + 1}
            {" "}- {Math.min(effectiveUserPage * USER_PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`h-8 px-2 text-xs ${neoControl}`}
              onClick={() => setUserPage(Math.max(1, effectiveUserPage - 1))}
              disabled={effectiveUserPage <= 1}
            >
              Prev
            </Button>
            <span className="font-semibold">
              {effectiveUserPage} / {totalUserPages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={`h-8 px-2 text-xs ${neoControl}`}
              onClick={() => setUserPage(Math.min(totalUserPages, effectiveUserPage + 1))}
              disabled={effectiveUserPage >= totalUserPages}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      <Card className={`${neoCard} space-y-3`}>
        <div>
          <CardTitle>Projects & Members</CardTitle>
          <CardDescription className="mt-1">프로젝트별 참여자 수(Owner 포함)와 전체 참여 명단을 확인할 수 있습니다.</CardDescription>
        </div>

        <div className="space-y-2">
          {projects.map((project) => {
            const members = membersByProjectId.get(project.id) ?? [];
            const canManageThisProject = manageableProjectIdSet.has(project.id);
            const canDeleteThisProject = deletableProjectIdSet.has(project.id);

            return (
              <div
                key={project.id}
                className="rounded-xl border-2 border-zinc-900 bg-zinc-50 p-3 shadow-[2px_2px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-800/50 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{project.name}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">참여자 {members.length}명</p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {canManageThisProject ? (
                      <Button
                        type="button"
                        size="sm"
                        className={`h-8 px-2 text-xs ${neoControl}`}
                        onClick={() => openAddMemberModal(project.id)}
                      >
                        Add Member
                      </Button>
                    ) : (
                      <Badge variant="neutral">VIEW</Badge>
                    )}

                    {canDeleteThisProject ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={`h-8 border-rose-700 px-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-400 dark:text-rose-300 dark:hover:bg-rose-950/40`}
                        onClick={() => handleDeleteProject(project.id, project.name)}
                      >
                        Delete Project
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {members.length > 0 ? (
                    members.map((member) => (
                      <span
                        key={`${project.id}-${member.user.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                      >
                        {member.user.displayName}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-500">참여자가 없습니다.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {selectedModalProject ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/55 px-4 pt-20"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeAddMemberModal();
            }
          }}
        >
          <div className={`w-full max-w-lg border-4 border-zinc-900 p-4 shadow-[10px_10px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[10px_10px_0_0_#f4f4f5] ${neoCard}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-zinc-900 dark:text-zinc-100">Add Member</h3>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{selectedModalProject.name} 프로젝트 구성원을 추가합니다.</p>
              </div>
              <Button type="button" variant="outline" size="sm" className={`h-8 px-2 text-xs ${neoControl}`} onClick={closeAddMemberModal}>
                Close
              </Button>
            </div>

            {!selectedModalProjectCanManage ? (
              <CardDescription className="mt-4">이 프로젝트에 구성원을 추가할 권한이 없습니다.</CardDescription>
            ) : usersNotInSelectedProject.length === 0 ? (
              <CardDescription className="mt-4">추가 가능한 사용자가 없습니다.</CardDescription>
            ) : (
              <div className="mt-4 space-y-2">
                <UserAutocompleteSelect
                  value={effectiveMemberCandidateId}
                  onChange={setMemberCandidateId}
                  options={memberCandidateOptions}
                  placeholder="사용자 이름/아이디 입력"
                  allowClear={false}
                  disabled={usersNotInSelectedProject.length === 0}
                  inputClassName={neoControl}
                  panelClassName={neoControl}
                />

                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <select
                    value={memberCandidateRole}
                    onChange={(event) => setMemberCandidateRole(event.target.value as ProjectMemberRole)}
                    className={`h-11 rounded-md bg-white px-3 text-sm dark:bg-zinc-900 ${neoControl}`}
                  >
                    <option value="read">READ</option>
                    <option value="write">WRITE</option>
                  </select>

                  <Button type="button" className={`h-11 px-4 ${neoControl}`} onClick={handleAddMember}>
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
