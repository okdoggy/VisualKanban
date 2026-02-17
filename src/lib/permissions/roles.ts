import type { AccessRole, FeatureKey, PermissionAssignment, Task, User } from "@/lib/types";

export type EffectiveRole = AccessRole | "none";

const roleWeight: Record<AccessRole, number> = {
  private: 3,
  admin: 4,
  editor: 2,
  viewer: 1
};

export function resolveRole({
  user,
  projectId,
  feature,
  assignments
}: {
  user: User | null;
  projectId: string;
  feature: FeatureKey;
  assignments: PermissionAssignment[];
}): EffectiveRole {
  if (!user) return "none";

  if (user.baseRole === "admin") return "admin";

  const scoped = assignments.filter((item) => item.projectId === projectId && item.feature === feature);
  const privateOwners = scoped.filter((item) => item.role === "private").map((item) => item.userId);

  if (privateOwners.length > 0 && !privateOwners.includes(user.id)) {
    return "none";
  }

  const target = scoped.find((item) => item.userId === user.id);
  return target?.role ?? "viewer";
}

export function canRead(role: EffectiveRole) {
  return role !== "none";
}

export function canWrite(role: EffectiveRole) {
  return role === "admin" || role === "editor" || role === "private";
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
