import type { Project, ProjectMemberRole, ProjectMembership, User } from "@/lib/types";

export type ProjectMember = {
  user: User;
  role: ProjectMemberRole;
};

const memberRoleWeight: Record<ProjectMemberRole, number> = {
  owner: 3,
  write: 2,
  read: 1
};

function strongerMemberRole(currentRole: ProjectMemberRole | undefined, nextRole: ProjectMemberRole) {
  if (!currentRole) return nextRole;
  return memberRoleWeight[nextRole] > memberRoleWeight[currentRole] ? nextRole : currentRole;
}

export function getMemberRolesByProjectId({
  projects,
  projectMemberships
}: {
  projects: Project[];
  projectMemberships: ProjectMembership[];
}) {
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
}

export function getMembersByProjectId({
  projects,
  memberRolesByProjectId,
  usersById
}: {
  projects: Project[];
  memberRolesByProjectId: Map<string, Map<string, ProjectMemberRole>>;
  usersById: Map<string, User>;
}) {
  const next = new Map<string, ProjectMember[]>();

  for (const project of projects) {
    const roleMap = memberRolesByProjectId.get(project.id) ?? new Map<string, ProjectMemberRole>();

    const members = [...roleMap.entries()]
      .map(([userId, role]) => {
        const user = usersById.get(userId);
        if (!user) return null;
        return { user, role };
      })
      .filter((item): item is ProjectMember => Boolean(item))
      .sort((left, right) => left.user.displayName.localeCompare(right.user.displayName));

    next.set(project.id, members);
  }

  return next;
}

export function getProjectNamesByUserId({
  projects,
  membersByProjectId
}: {
  projects: Project[];
  membersByProjectId: Map<string, ProjectMember[]>;
}) {
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
}

export function getUsersNotInProject({
  users,
  memberRolesByProjectId,
  projectId
}: {
  users: User[];
  memberRolesByProjectId: Map<string, Map<string, ProjectMemberRole>>;
  projectId: string;
}) {
  const roleMap = memberRolesByProjectId.get(projectId) ?? new Map<string, ProjectMemberRole>();

  return users.filter((user) => !roleMap.has(user.id)).sort((left, right) => left.displayName.localeCompare(right.displayName));
}
