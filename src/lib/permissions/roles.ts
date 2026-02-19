import type { AccessRole, FeatureKey, PermissionAssignment, Project, ProjectMemberRole, ProjectMembership, Task, User } from "@/lib/types";

export type EffectiveRole = AccessRole | "none";
const WRITE_SENSITIVE_FEATURES = new Set<FeatureKey>(["kanban", "gantt", "whiteboard"]);

const roleWeight: Record<AccessRole, number> = {
  private: 3,
  admin: 4,
  editor: 2,
  viewer: 1
};

const projectMemberRoleWeight: Record<ProjectMemberRole, number> = {
  read: 1,
  write: 2,
  owner: 3
};

function resolveLegacyFeatureRole({
  user,
  projectId,
  feature,
  assignments
}: {
  user: User;
  projectId: string;
  feature: FeatureKey;
  assignments: PermissionAssignment[];
}): EffectiveRole {
  const scoped = assignments.filter((item) => item.projectId === projectId && item.feature === feature);
  const privateOwners = scoped.filter((item) => item.role === "private").map((item) => item.userId);

  if (privateOwners.length > 0 && !privateOwners.includes(user.id)) {
    return "none";
  }

  const target = scoped.find((item) => item.userId === user.id);
  return target?.role ?? "viewer";
}

export function resolveProjectMemberRole({
  user,
  projectId,
  projectMemberships,
  projects
}: {
  user: User | null;
  projectId: string;
  projectMemberships: ProjectMembership[];
  projects: Project[];
}): ProjectMemberRole | null {
  if (!user) return null;

  const scopedMemberships = projectMemberships.filter((item) => item.projectId === projectId && item.userId === user.id);
  const scopedRole = scopedMemberships
    .map((item) => item.role)
    .sort((left, right) => projectMemberRoleWeight[right] - projectMemberRoleWeight[left])[0];

  if (scopedRole) {
    return scopedRole;
  }

  const project = projects.find((item) => item.id === projectId);
  if (project?.ownerId === user.id) {
    return "owner";
  }

  return null;
}

export function resolveRole({
  user,
  projectId,
  feature,
  assignments,
  projectMemberships = [],
  projects = []
}: {
  user: User | null;
  projectId: string;
  feature: FeatureKey;
  assignments: PermissionAssignment[];
  projectMemberships?: ProjectMembership[];
  projects?: Project[];
}): EffectiveRole {
  if (!user) return "none";

  if (user.baseRole === "admin") return "admin";

  const legacyRole = resolveLegacyFeatureRole({
    user,
    projectId,
    feature,
    assignments
  });

  if (legacyRole === "none") {
    return "none";
  }

  if (!WRITE_SENSITIVE_FEATURES.has(feature)) {
    return legacyRole;
  }

  const memberRole = resolveProjectMemberRole({
    user,
    projectId,
    projectMemberships,
    projects
  });

  if (!memberRole || memberRole === "read") {
    return "viewer";
  }

  if (memberRole === "owner") {
    return "admin";
  }

  if (legacyRole === "private") {
    return "private";
  }

  if (legacyRole === "admin" || legacyRole === "editor") {
    return "editor";
  }

  return "editor";
}

export function canRead(role: EffectiveRole) {
  return role !== "none";
}

export function canWrite(role: EffectiveRole) {
  return role === "admin" || role === "editor" || role === "private";
}

export function canManageProjectMembers({
  actor,
  projectId,
  projectMemberships,
  projects
}: {
  actor: User | null;
  projectId: string;
  projectMemberships: ProjectMembership[];
  projects: Project[];
}) {
  if (!actor) return false;
  if (actor.baseRole === "admin") return true;

  const role = resolveProjectMemberRole({
    user: actor,
    projectId,
    projectMemberships,
    projects
  });

  return role === "owner" || role === "write";
}

export function canSeeTask(user: User | null, task: Task, role: EffectiveRole) {
  if (!user) return false;
  if (role === "none") return false;
  if (user.baseRole === "admin") return true;
  if (task.visibility === "private") {
    return task.ownerId === user.id;
  }
  if (role === "private") {
    return task.ownerId === user.id;
  }
  return true;
}

export function highestRole(assignments: PermissionAssignment[]) {
  return assignments
    .map((a) => a.role)
    .sort((a, b) => roleWeight[b] - roleWeight[a])[0] ?? "viewer";
}
