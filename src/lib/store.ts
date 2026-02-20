"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  SEED_DATA_REVISION,
  seedActivities,
  seedKanbanHistory,
  seedKanbanTasks,
  seedProjectMemberships,
  seedPersonalTodos,
  seedPermissions,
  seedProjects,
  seedTasks,
  seedWhiteboardScenes,
  seedUsers
} from "@/lib/data/seed";
import { canManageProjectMembers, canSeeTask, canWrite, resolveProjectMemberRole, resolveRole } from "@/lib/permissions/roles";
import type {
  AccountWorkspacePreference,
  AccessRole,
  AddTodoInput,
  Activity,
  BaseRole,
  FeatureKey,
  KanbanHistoryItem,
  KanbanTaskPatch,
  KanbanTaskStatus,
  PersonalTodo,
  ProjectMemberRole,
  Task,
  TaskStatus,
  TodoPriority,
  TodoRecurrence,
  TodoWeekday,
  UpdateTodoInput,
  User,
  WorkspaceLanguage,
  WorkspaceStyle,
  WorkspaceStylePreset,
  WhiteboardScene,
  WhiteboardSceneData,
  VisualKanbanSharedSnapshot,
  VisualKanbanState
} from "@/lib/types";

function uid(prefix: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function writeAuthCookie(userId: string | null) {
  if (typeof document === "undefined") return;
  if (!userId) {
    document.cookie = "vk_user=; Max-Age=0; Path=/";
    return;
  }
  document.cookie = `vk_user=${userId}; Max-Age=604800; Path=/; SameSite=Lax`;
}

function nowIso() {
  return new Date().toISOString();
}

const TODO_PRIORITY_DEFAULT: TodoPriority = 4;
const TODO_REPEAT_COLOR_DEFAULT = "#22c55e";
const DEFAULT_WORKSPACE_LANGUAGE: WorkspaceLanguage = "ko";
const DEFAULT_WORKSPACE_STYLE: WorkspaceStyle = "neo-classic";
const WORKSPACE_STYLE_PRESETS = new Set<WorkspaceStylePreset>([
  "neo-classic",
  "neo-vivid",
  "modern-light",
  "modern-brown"
]);
const FEATURE_KEYS: FeatureKey[] = ["project", "kanban", "whiteboard", "gantt", "taskboard", "todo", "search"];
const FEATURE_KEY_SET = new Set<string>(FEATURE_KEYS);
const ACTIVITY_TYPE_SET = new Set<string>(["login", "task_move", "permission_change", "task_create"]);
const SESSION_LOCAL_STATE_KEYS = ["currentUserId", "connectedUserIds", "sessionCheckedAt"] as const;
const CURRENT_SEED_REVISION = SEED_DATA_REVISION;
export const VISUAL_KANBAN_SHARED_SNAPSHOT_KEYS = [
  "seedRevision",
  "users",
  "projects",
  "projectMemberships",
  "permissions",
  "personalTodos",
  "tasks",
  "kanbanTasks",
  "kanbanHistory",
  "whiteboardScenes",
  "activities",
  "workspacePreferencesByAccountId",
  "recentProjectIdByAccountId"
] as const satisfies readonly (keyof VisualKanbanSharedSnapshot)[];
type VisualKanbanSharedSnapshotKey = (typeof VISUAL_KANBAN_SHARED_SNAPSHOT_KEYS)[number];
type SessionLocalStateKey = (typeof SESSION_LOCAL_STATE_KEYS)[number];

function normalizeWorkspaceLanguage(language: WorkspaceLanguage | null | undefined): WorkspaceLanguage {
  return language === "en" ? "en" : "ko";
}

function normalizeWorkspaceStyle(style: WorkspaceStyle | string | null | undefined): WorkspaceStylePreset {
  const legacyAlias = typeof style === "string" ? (style === "warm-brown" ? "modern-brown" : style === "modern-dark" ? "modern-light" : style) : null;
  return legacyAlias && WORKSPACE_STYLE_PRESETS.has(legacyAlias as WorkspaceStylePreset)
    ? (legacyAlias as WorkspaceStylePreset)
    : (DEFAULT_WORKSPACE_STYLE as WorkspaceStylePreset);
}

function resolveAccountWorkspacePreference({
  accountId,
  workspacePreferencesByAccountId,
  fallbackLanguage,
  fallbackStyle
}: {
  accountId: string;
  workspacePreferencesByAccountId: Record<string, AccountWorkspacePreference>;
  fallbackLanguage: WorkspaceLanguage;
  fallbackStyle: WorkspaceStyle;
}): AccountWorkspacePreference {
  const existing = workspacePreferencesByAccountId[accountId];
  return {
    language: normalizeWorkspaceLanguage(existing?.language ?? fallbackLanguage),
    style: normalizeWorkspaceStyle(existing?.style ?? fallbackStyle)
  };
}

function shouldUpdateAccountWorkspacePreference(
  current: AccountWorkspacePreference | undefined,
  next: AccountWorkspacePreference
) {
  if (!current) return true;
  return current.language !== next.language || current.style !== next.style;
}

function resolveWorkspaceFallbackForAccount({
  accountId,
  workspacePreferencesByAccountId,
  fallbackLanguage,
  fallbackStyle
}: {
  accountId: string;
  workspacePreferencesByAccountId: Record<string, AccountWorkspacePreference>;
  fallbackLanguage: WorkspaceLanguage;
  fallbackStyle: WorkspaceStyle;
}) {
  const hasExistingPreference = Boolean(workspacePreferencesByAccountId[accountId]);
  if (hasExistingPreference || Object.keys(workspacePreferencesByAccountId).length === 0) {
    return {
      language: normalizeWorkspaceLanguage(fallbackLanguage),
      style: normalizeWorkspaceStyle(fallbackStyle)
    };
  }

  return {
    language: DEFAULT_WORKSPACE_LANGUAGE,
    style: normalizeWorkspaceStyle(DEFAULT_WORKSPACE_STYLE)
  };
}

function normalizeTodoPriority(priority?: number): TodoPriority {
  if (!Number.isFinite(priority)) {
    return TODO_PRIORITY_DEFAULT;
  }

  const normalized = Math.min(7, Math.max(1, Math.trunc(priority ?? TODO_PRIORITY_DEFAULT)));
  return normalized as TodoPriority;
}

function normalizeTodoRepeatColor(repeatColor?: string) {
  const cleaned = repeatColor?.trim();
  return cleaned && cleaned.length > 0 ? cleaned : TODO_REPEAT_COLOR_DEFAULT;
}

function normalizeTodoWeekdays(weekdays?: number[]): TodoWeekday[] {
  const unique = new Set<TodoWeekday>();

  for (const weekday of weekdays ?? []) {
    const normalized = Math.trunc(weekday) as TodoWeekday;
    if (normalized >= 0 && normalized <= 6) {
      unique.add(normalized);
    }
  }

  return [...unique].sort((left, right) => left - right);
}

function normalizeTodoRecurrence(recurrence?: TodoRecurrence): TodoRecurrence {
  if (!recurrence || recurrence.type === "none") {
    return { type: "none" };
  }
  if (recurrence.type === "daily") {
    return { type: "daily" };
  }

  const weekdays = normalizeTodoWeekdays(recurrence.weekdays);
  if (weekdays.length === 0) {
    return { type: "none" };
  }

  return { type: "weekly", weekdays };
}

function recurrenceEquals(left: TodoRecurrence, right: TodoRecurrence) {
  if (left.type !== right.type) return false;
  if (left.type !== "weekly" || right.type !== "weekly") return true;
  if (left.weekdays.length !== right.weekdays.length) return false;
  return left.weekdays.every((weekday, index) => weekday === right.weekdays[index]);
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nextLocalMidnight(date: Date) {
  const next = startOfLocalDay(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function nextWeeklyResetDate(completedAt: Date, weekdays: TodoWeekday[]): Date | null {
  const normalizedWeekdays = normalizeTodoWeekdays(weekdays);
  if (normalizedWeekdays.length === 0) return null;

  const start = nextLocalMidnight(completedAt);
  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + dayOffset);
    if (normalizedWeekdays.includes(candidate.getDay() as TodoWeekday)) {
      candidate.setHours(0, 0, 0, 0);
      return candidate;
    }
  }

  return null;
}

function applyTodoLifecycle(todos: PersonalTodo[], ownerId?: string, referenceDate: Date = new Date()) {
  const now = referenceDate.getTime();
  const nextUpdatedAt = referenceDate.toISOString();
  const lifecycle = {
    todos: [] as PersonalTodo[],
    removed: 0,
    reactivated: 0
  };

  for (const todo of todos) {
    if (ownerId && todo.ownerId !== ownerId) {
      lifecycle.todos.push(todo);
      continue;
    }

    const normalizedRecurrence = normalizeTodoRecurrence(todo.recurrence);
    const normalizedPriority = normalizeTodoPriority(todo.priority);
    const normalizedRepeatColor = normalizeTodoRepeatColor(todo.repeatColor);
    const normalizedTodo =
      recurrenceEquals(normalizedRecurrence, todo.recurrence) &&
      normalizedPriority === todo.priority &&
      normalizedRepeatColor === todo.repeatColor
        ? todo
        : {
            ...todo,
            recurrence: normalizedRecurrence,
            priority: normalizedPriority,
            repeatColor: normalizedRepeatColor
          };

    if (!normalizedTodo.completed) {
      lifecycle.todos.push(normalizedTodo);
      continue;
    }

    const completedAt =
      parseIsoDate(normalizedTodo.completedAt) ?? parseIsoDate(normalizedTodo.updatedAt) ?? parseIsoDate(normalizedTodo.createdAt) ?? referenceDate;

    if (normalizedTodo.recurrence.type === "none") {
      if (now >= nextLocalMidnight(completedAt).getTime()) {
        lifecycle.removed += 1;
        continue;
      }
      lifecycle.todos.push(normalizedTodo);
      continue;
    }

    const reactivationDate =
      normalizedTodo.recurrence.type === "daily"
        ? nextLocalMidnight(completedAt)
        : nextWeeklyResetDate(completedAt, normalizedTodo.recurrence.weekdays);

    if (reactivationDate && now >= reactivationDate.getTime()) {
      lifecycle.reactivated += 1;
      lifecycle.todos.push({
        ...normalizedTodo,
        completed: false,
        completedAt: null,
        updatedAt: nextUpdatedAt
      });
      continue;
    }

    lifecycle.todos.push(normalizedTodo);
  }

  return lifecycle;
}

const persistStorage = typeof window === "undefined" ? undefined : createJSONStorage(() => window.localStorage);

function makeActivity(params: Pick<Activity, "actorId" | "type" | "message">): Activity {
  return {
    id: uid("act"),
    actorId: params.actorId,
    type: params.type,
    message: params.message,
    createdAt: nowIso()
  };
}

function collectTaskAndDescendantIds(tasks: Task[], rootTaskId: string) {
  const byParent = new Map<string, string[]>();

  for (const task of tasks) {
    if (!task.parentTaskId) continue;
    const siblings = byParent.get(task.parentTaskId) ?? [];
    siblings.push(task.id);
    byParent.set(task.parentTaskId, siblings);
  }

  const queue = [rootTaskId];
  const collected = new Set<string>();

  while (queue.length > 0) {
    const currentTaskId = queue.shift();
    if (!currentTaskId || collected.has(currentTaskId)) continue;
    collected.add(currentTaskId);

    const children = byParent.get(currentTaskId) ?? [];
    for (const childTaskId of children) {
      queue.push(childTaskId);
    }
  }

  return [...collected];
}

const KANBAN_TODO_TAG = "kanban-stage:todo";
const MAX_KANBAN_HISTORY_PER_PROJECT = 20;

function uniqTags(tags: string[]) {
  return [...new Set(tags)];
}

function getKanbanStage(task: Task): KanbanTaskStatus {
  if (task.status === "backlog" && task.tags.includes(KANBAN_TODO_TAG)) {
    return "todo";
  }
  return task.status;
}

function applyKanbanStage(task: Task, nextStatus: KanbanTaskStatus, nextTags?: string[]): Task {
  const tagsWithoutTodo = (nextTags ?? task.tags).filter((tag) => tag !== KANBAN_TODO_TAG);
  if (nextStatus === "todo") {
    return {
      ...task,
      status: "backlog",
      tags: uniqTags([KANBAN_TODO_TAG, ...tagsWithoutTodo]),
      updatedAt: nowIso()
    };
  }

  return {
    ...task,
    status: nextStatus,
    tags: uniqTags(tagsWithoutTodo),
    updatedAt: nowIso()
  };
}

function cloneTaskSnapshot(task: Task): Task {
  return {
    ...task,
    participantIds: task.participantIds ? [...task.participantIds] : undefined,
    tags: [...task.tags]
  };
}

function trimKanbanHistoryByProject(history: KanbanHistoryItem[]) {
  const countByProject = new Map<string, number>();
  return history.filter((item) => {
    const nextCount = (countByProject.get(item.projectId) ?? 0) + 1;
    countByProject.set(item.projectId, nextCount);
    return nextCount <= MAX_KANBAN_HISTORY_PER_PROJECT;
  });
}

function normalizeBaseRole(baseRole?: BaseRole): BaseRole {
  if (baseRole === "admin" || baseRole === "editor") {
    return baseRole;
  }
  return "viewer";
}

function normalizeUserPart(part?: string) {
  const normalized = part?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizePermissionFeature(feature: unknown): FeatureKey | null {
  if (typeof feature !== "string") return null;
  if (feature === "mindmap") return "whiteboard";
  if (feature === "comments") return null;
  return FEATURE_KEY_SET.has(feature) ? (feature as FeatureKey) : null;
}

function normalizeActivityType(type: unknown): Activity["type"] | null {
  if (typeof type !== "string") return null;
  if (type === "comment_add") return null;
  return ACTIVITY_TYPE_SET.has(type) ? (type as Activity["type"]) : null;
}

const LEGACY_TEST_ACCOUNT_USERNAMES = new Set(["editor", "viewer", "me"]);

function sanitizeLegacySeedAccounts(state: VisualKanbanState): VisualKanbanState {
  const seedAdminUser = seedUsers.find((user) => user.username.trim().toLowerCase() === "admin");
  let users = state.users.filter((user) => !LEGACY_TEST_ACCOUNT_USERNAMES.has(user.username.trim().toLowerCase()));

  const hasAdminUser = users.some((user) => user.username.trim().toLowerCase() === "admin");
  if (!hasAdminUser && seedAdminUser) {
    users = [{ ...seedAdminUser }, ...users.filter((user) => user.id !== seedAdminUser.id)];
  }

  if (users.length === 0) {
    return state;
  }

  users = users.map((user) => {
    const normalizedPart = normalizeUserPart(user.part);
    return normalizedPart === user.part ? user : { ...user, part: normalizedPart };
  });

  const validUserIds = new Set(users.map((user) => user.id));
  const fallbackUserId = users.find((user) => user.username.trim().toLowerCase() === "admin")?.id ?? users[0]?.id;
  if (!fallbackUserId) {
    return {
      ...state,
      users
    };
  }

  const normalizeUserId = (userId: string) => (validUserIds.has(userId) ? userId : fallbackUserId);
  const normalizeParticipantIds = (participantIds: string[] | undefined, assigneeId: string) => {
    const normalized = [...new Set((participantIds ?? []).map(normalizeUserId).filter((id) => validUserIds.has(id)))];
    if (normalized.length > 0) {
      return normalized;
    }
    return [assigneeId];
  };
  const normalizeTaskUsers = (task: Task): Task => {
    const assigneeId = normalizeUserId(task.assigneeId);
    const reporterId = normalizeUserId(task.reporterId);
    const ownerId = normalizeUserId(task.ownerId);
    const participantIds = normalizeParticipantIds(task.participantIds, assigneeId);

    if (
      assigneeId === task.assigneeId &&
      reporterId === task.reporterId &&
      ownerId === task.ownerId &&
      participantIds.length === (task.participantIds?.length ?? 0) &&
      participantIds.every((id, index) => id === (task.participantIds ?? [])[index])
    ) {
      return task;
    }

    return {
      ...task,
      assigneeId,
      reporterId,
      ownerId,
      participantIds
    };
  };

  const projects = state.projects.map((project) => {
    const ownerId = normalizeUserId(project.ownerId);
    return ownerId === project.ownerId ? project : { ...project, ownerId };
  });
  const projectIds = new Set(projects.map((project) => project.id));

  const projectMemberships = state.projectMemberships
    .filter((membership) => projectIds.has(membership.projectId) && validUserIds.has(membership.userId))
    .map((membership) => ({
      ...membership,
      userId: normalizeUserId(membership.userId)
    }));
  const existingMembershipKeys = new Set(projectMemberships.map((membership) => `${membership.projectId}:${membership.userId}`));
  const ownerMemberships = projects
    .filter((project) => !existingMembershipKeys.has(`${project.id}:${project.ownerId}`))
    .map((project) => ({
      id: uid("project-member"),
      projectId: project.id,
      userId: project.ownerId,
      role: "owner" as const,
      updatedAt: nowIso()
    }));

  const tasks = state.tasks.filter((task) => projectIds.has(task.projectId)).map(normalizeTaskUsers);
  const kanbanTasks = state.kanbanTasks.filter((task) => projectIds.has(task.projectId)).map(normalizeTaskUsers);
  const permissions: VisualKanbanState["permissions"] = [];
  const seenPermissionKeys = new Set<string>();

  for (const permission of state.permissions) {
    if (!projectIds.has(permission.projectId) || !validUserIds.has(permission.userId)) continue;
    const feature = normalizePermissionFeature((permission as { feature?: unknown }).feature);
    if (!feature) continue;

    const dedupeKey = `${permission.projectId}:${permission.userId}:${feature}`;
    if (seenPermissionKeys.has(dedupeKey)) continue;
    seenPermissionKeys.add(dedupeKey);

    permissions.push({
      ...permission,
      feature
    });
  }

  const activities: VisualKanbanState["activities"] = [];
  for (const activity of state.activities) {
    const type = normalizeActivityType((activity as { type?: unknown }).type);
    if (!type) continue;
    activities.push({
      ...activity,
      actorId: normalizeUserId(activity.actorId),
      type
    });
  }

  return {
    ...state,
    users,
    projects,
    projectMemberships: [...ownerMemberships, ...projectMemberships],
    permissions,
    personalTodos: state.personalTodos.map((todo) => ({
      ...todo,
      ownerId: normalizeUserId(todo.ownerId)
    })),
    tasks,
    kanbanTasks,
    kanbanHistory: state.kanbanHistory
      .filter((item) => projectIds.has(item.projectId))
      .map((item) => ({
        ...item,
        finalizedBy: normalizeUserId(item.finalizedBy),
        task: normalizeTaskUsers(item.task)
      })),
    whiteboardScenes: state.whiteboardScenes
      .filter((scene) => projectIds.has(scene.projectId))
      .map((scene) => ({
        ...scene,
        updatedBy: normalizeUserId(scene.updatedBy)
      })),
    activities,
    currentUserId: state.currentUserId && validUserIds.has(state.currentUserId) ? state.currentUserId : null,
    connectedUserIds: state.connectedUserIds.filter((id) => validUserIds.has(id)),
    workspacePreferencesByAccountId: Object.fromEntries(
      Object.entries(state.workspacePreferencesByAccountId)
        .filter(([accountId]) => validUserIds.has(accountId))
        .map(([accountId, preference]) => [
          accountId,
          {
            language: normalizeWorkspaceLanguage(preference?.language),
            style: normalizeWorkspaceStyle(preference?.style)
          }
        ])
    ),
    recentProjectIdByAccountId: Object.fromEntries(
      Object.entries(state.recentProjectIdByAccountId).filter(([accountId, projectId]) => validUserIds.has(accountId) && projectIds.has(projectId))
    )
  };
}

function getCurrentUserFromState(state: Pick<VisualKanbanState, "users" | "currentUserId">) {
  return getCurrentUser(state.users, state.currentUserId);
}

function getEffectiveRoleInState({
  state,
  projectId,
  feature
}: {
  state: Pick<VisualKanbanState, "users" | "currentUserId" | "permissions" | "projectMemberships" | "projects">;
  projectId: string;
  feature: FeatureKey;
}) {
  const user = getCurrentUserFromState(state);
  return resolveRole({
    user,
    projectId,
    feature,
    assignments: state.permissions,
    projectMemberships: state.projectMemberships,
    projects: state.projects
  });
}

function canCurrentUserWriteFeature({
  state,
  projectId,
  feature
}: {
  state: Pick<VisualKanbanState, "users" | "currentUserId" | "permissions" | "projectMemberships" | "projects">;
  projectId: string;
  feature: FeatureKey;
}) {
  return canWrite(
    getEffectiveRoleInState({
      state,
      projectId,
      feature
    })
  );
}

function pickSessionLocalState(state: Pick<VisualKanbanState, SessionLocalStateKey>) {
  return {
    currentUserId: state.currentUserId,
    connectedUserIds: state.connectedUserIds,
    sessionCheckedAt: state.sessionCheckedAt
  };
}

export function getSharedStateSnapshot(state: Pick<VisualKanbanState, VisualKanbanSharedSnapshotKey>): VisualKanbanSharedSnapshot {
  return {
    seedRevision: state.seedRevision,
    users: state.users,
    projects: state.projects,
    projectMemberships: state.projectMemberships,
    permissions: state.permissions,
    personalTodos: state.personalTodos,
    tasks: state.tasks,
    kanbanTasks: state.kanbanTasks,
    kanbanHistory: state.kanbanHistory,
    whiteboardScenes: state.whiteboardScenes,
    activities: state.activities,
    workspacePreferencesByAccountId: state.workspacePreferencesByAccountId,
    recentProjectIdByAccountId: state.recentProjectIdByAccountId
  };
}

function mergeSharedStateSnapshot(
  state: VisualKanbanState,
  snapshot: Partial<VisualKanbanSharedSnapshot>
): Pick<VisualKanbanState, VisualKanbanSharedSnapshotKey> {
  const localCurrentUser = getCurrentUser(state.users, state.currentUserId);
  const incomingUsers = snapshot.users;
  const incomingSnapshotDropsCurrentUser =
    Boolean(localCurrentUser) && Array.isArray(incomingUsers) && !incomingUsers.some((user) => user.id === localCurrentUser?.id);

  if (incomingSnapshotDropsCurrentUser) {
    // Guard against stale/conflicting remote snapshots that would effectively force logout
    // by removing the currently logged-in user from the shared user list.
    const sessionLocalState = pickSessionLocalState(state);
    const normalizedCurrentState = {
      ...sanitizeLegacySeedAccounts(state),
      ...sessionLocalState
    };

    return getSharedStateSnapshot(normalizedCurrentState);
  }

  const mergedState: VisualKanbanState = {
    ...state,
    seedRevision: snapshot.seedRevision ?? state.seedRevision,
    users: snapshot.users ?? state.users,
    projects: snapshot.projects ?? state.projects,
    projectMemberships: snapshot.projectMemberships ?? state.projectMemberships,
    permissions: snapshot.permissions ?? state.permissions,
    personalTodos: snapshot.personalTodos ?? state.personalTodos,
    tasks: snapshot.tasks ?? state.tasks,
    kanbanTasks: snapshot.kanbanTasks ?? state.kanbanTasks,
    kanbanHistory: snapshot.kanbanHistory ?? state.kanbanHistory,
    whiteboardScenes: snapshot.whiteboardScenes ?? state.whiteboardScenes,
    activities: snapshot.activities ?? state.activities,
    workspacePreferencesByAccountId: snapshot.workspacePreferencesByAccountId ?? state.workspacePreferencesByAccountId,
    recentProjectIdByAccountId: snapshot.recentProjectIdByAccountId ?? state.recentProjectIdByAccountId
  };

  const sessionLocalState = pickSessionLocalState(state);
  const normalizedMergedState = {
    ...sanitizeLegacySeedAccounts(mergedState),
    ...sessionLocalState
  };

  return getSharedStateSnapshot(normalizedMergedState);
}

export const useVisualKanbanStore = create<VisualKanbanState>()(
  persist(
    (set, get) => ({
      seedRevision: CURRENT_SEED_REVISION,
      users: seedUsers,
      projects: seedProjects,
      projectMemberships: seedProjectMemberships,
      permissions: seedPermissions,
      personalTodos: seedPersonalTodos,
      tasks: seedTasks,
      kanbanTasks: seedKanbanTasks,
      kanbanHistory: seedKanbanHistory,
      whiteboardScenes: seedWhiteboardScenes,
      activities: seedActivities,
      currentUserId: null,
      connectedUserIds: [],
      sessionCheckedAt: null,
      workspaceLanguage: DEFAULT_WORKSPACE_LANGUAGE,
      workspaceStyle: DEFAULT_WORKSPACE_STYLE,
      workspacePreferencesByAccountId: {},
      recentProjectIdByAccountId: {},

      login: (username, password) => {
        const user = get().users.find((candidate) => candidate.username === username.trim());
        if (!user) {
          return { ok: false, reason: "존재하지 않는 계정입니다." };
        }
        if (user.password !== password) {
          return { ok: false, reason: "비밀번호가 올바르지 않습니다." };
        }

        writeAuthCookie(user.id);
        set((state) => {
          const fallbackPreference = resolveWorkspaceFallbackForAccount({
            accountId: user.id,
            workspacePreferencesByAccountId: state.workspacePreferencesByAccountId,
            fallbackLanguage: state.workspaceLanguage,
            fallbackStyle: state.workspaceStyle
          });
          const resolvedWorkspacePreference = resolveAccountWorkspacePreference({
            accountId: user.id,
            workspacePreferencesByAccountId: state.workspacePreferencesByAccountId,
            fallbackLanguage: fallbackPreference.language,
            fallbackStyle: fallbackPreference.style
          });
          const existingWorkspacePreference = state.workspacePreferencesByAccountId[user.id];
          const nextWorkspacePreferencesByAccountId = shouldUpdateAccountWorkspacePreference(
            existingWorkspacePreference,
            resolvedWorkspacePreference
          )
            ? {
                ...state.workspacePreferencesByAccountId,
                [user.id]: resolvedWorkspacePreference
              }
            : state.workspacePreferencesByAccountId;

          return {
            personalTodos: applyTodoLifecycle(state.personalTodos, user.id).todos,
            currentUserId: user.id,
            connectedUserIds: state.connectedUserIds.includes(user.id) ? state.connectedUserIds : [...state.connectedUserIds, user.id],
            sessionCheckedAt: nowIso(),
            workspaceLanguage: resolvedWorkspacePreference.language,
            workspaceStyle: resolvedWorkspacePreference.style,
            workspacePreferencesByAccountId: nextWorkspacePreferencesByAccountId,
            activities: [makeActivity({ actorId: user.id, type: "login", message: `${user.username} 로그인 성공` }), ...state.activities].slice(
              0,
              200
            )
          };
        });

        return { ok: true, reason: user.mustChangePassword ? "MUST_CHANGE_PASSWORD" : undefined };
      },

      logout: () => {
        const currentUserId = get().currentUserId;
        writeAuthCookie(null);
        set((state) => ({
          currentUserId: null,
          connectedUserIds: currentUserId ? state.connectedUserIds.filter((id) => id !== currentUserId) : state.connectedUserIds,
          sessionCheckedAt: nowIso()
        }));
      },

      changePassword: (nextPassword) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "세션이 없습니다." };
        }
        const normalizedPassword = nextPassword.trim();
        if (!normalizedPassword) {
          return { ok: false, reason: "비밀번호를 입력해 주세요." };
        }
        if (normalizedPassword === "0000") {
          return { ok: false, reason: "초기 비밀번호(0000)는 사용할 수 없습니다." };
        }

        set((state) => ({
          users: state.users.map((user) =>
            user.id === currentUserId
              ? {
                  ...user,
                  password: normalizedPassword,
                  mustChangePassword: false
                }
              : user
          ),
          activities: [makeActivity({ actorId: currentUserId, type: "login", message: "초기 비밀번호를 변경했습니다." }), ...state.activities].slice(
            0,
            200
          )
        }));

        return { ok: true };
      },

      updateMyIcon: (nextIcon) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const cleaned = nextIcon.trim();
        if (!cleaned) {
          return { ok: false, reason: "아이콘을 입력해 주세요." };
        }
        if (cleaned.length > 4) {
          return { ok: false, reason: "아이콘은 최대 4자까지 입력할 수 있습니다." };
        }

        set((state) => ({
          users: state.users.map((user) => (user.id === currentUserId ? { ...user, icon: cleaned } : user))
        }));

        return { ok: true };
      },

      createUser: ({ username, displayName, part, password, baseRole }) => {
        const state = get();
        const actor = getCurrentUserFromState(state);
        if (!actor || actor.baseRole !== "admin") {
          return { ok: false, reason: "관리자만 사용자를 생성할 수 있습니다." };
        }

        const normalizedUsername = username.trim();
        const normalizedDisplayName = displayName.trim();
        const normalizedPart = normalizeUserPart(part);
        const normalizedPassword = password.trim();

        if (!normalizedUsername) {
          return { ok: false, reason: "아이디를 입력해 주세요." };
        }
        if (!normalizedDisplayName) {
          return { ok: false, reason: "이름을 입력해 주세요." };
        }
        if (!normalizedPassword) {
          return { ok: false, reason: "초기 비밀번호를 입력해 주세요." };
        }

        const usernameTaken = state.users.some((user) => user.username.toLowerCase() === normalizedUsername.toLowerCase());
        if (usernameTaken) {
          return { ok: false, reason: "이미 사용 중인 아이디입니다." };
        }

        const userId = uid("user");
        set((prevState) => ({
          users: [
            {
              id: userId,
              username: normalizedUsername,
              displayName: normalizedDisplayName,
              part: normalizedPart,
              password: normalizedPassword,
              mustChangePassword: true,
              baseRole: normalizeBaseRole(baseRole)
            },
            ...prevState.users
          ]
        }));

        return { ok: true, userId };
      },

      registerUserFromLogin: ({ username, password, part }) => {
        const normalizedUsername = username.trim();
        const normalizedPart = normalizeUserPart(part);

        if (!normalizedUsername) {
          return { ok: false, reason: "계정을 입력해 주세요." };
        }
        if (password !== "0000") {
          return { ok: false, reason: "신규 계정은 초기 비밀번호 0000으로만 생성할 수 있습니다." };
        }
        if (!normalizedPart) {
          return { ok: false, reason: "파트를 입력해 주세요." };
        }

        const usernameTaken = get().users.some((user) => user.username.toLowerCase() === normalizedUsername.toLowerCase());
        if (usernameTaken) {
          return { ok: false, reason: "이미 존재하는 계정입니다." };
        }

        const userId = uid("user");
        set((prevState) => ({
          users: [
            {
              id: userId,
              username: normalizedUsername,
              displayName: normalizedUsername,
              part: normalizedPart,
              password: "0000",
              mustChangePassword: true,
              baseRole: "viewer"
            },
            ...prevState.users
          ]
        }));

        const loginResult = get().login(normalizedUsername, password);
        if (!loginResult.ok) {
          set((state) => ({
            users: state.users.filter((user) => user.id !== userId)
          }));
          return { ok: false, reason: loginResult.reason ?? "신규 계정 로그인에 실패했습니다." };
        }

        return loginResult;
      },

      addProject: (input) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const name = input.name.trim();
        if (!name) {
          return { ok: false, reason: "프로젝트명을 입력해 주세요." };
        }

        const duplicated = get()
          .projects.some((project) => project.name.trim().toLowerCase() === name.toLowerCase());
        if (duplicated) {
          return { ok: false, reason: "같은 이름의 프로젝트가 이미 있습니다." };
        }

        const projectId = uid("proj");
        const nextUpdatedAt = nowIso();
        const ownerMembershipId = uid("project-member");
        set((state) => ({
          projects: [
            {
              id: projectId,
              name,
              description: input.description.trim(),
              ownerId: currentUserId
            },
            ...state.projects
          ],
          projectMemberships: [
            {
              id: ownerMembershipId,
              projectId,
              userId: currentUserId,
              role: "owner",
              updatedAt: nextUpdatedAt
            },
            ...state.projectMemberships.filter((membership) => !(membership.projectId === projectId && membership.userId === currentUserId))
          ],
          whiteboardScenes: [
            {
              id: uid("whiteboard"),
              projectId,
              scene: {
                elements: [],
                appState: {
                  viewBackgroundColor: "#ffffff",
                  scrollX: 0,
                  scrollY: 0
                },
                files: null
              },
              updatedAt: nextUpdatedAt,
              updatedBy: currentUserId
            },
            ...state.whiteboardScenes
          ]
        }));

        return { ok: true, projectId };
      },

      updateProject: (projectId, input) => {
        const state = get();
        const actor = getCurrentUserFromState(state);
        if (!actor) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const targetProject = state.projects.find((project) => project.id === projectId);
        if (!targetProject) {
          return { ok: false, reason: "프로젝트를 찾지 못했습니다." };
        }

        const actorMemberRole = canManageProjectMembers({
          actor,
          projectId,
          projectMemberships: state.projectMemberships,
          projects: state.projects
        });

        if (!actorMemberRole) {
          return { ok: false, reason: "프로젝트를 수정할 권한이 없습니다." };
        }

        const nextName = input.name === undefined ? targetProject.name : input.name.trim();
        if (!nextName) {
          return { ok: false, reason: "프로젝트명을 입력해 주세요." };
        }

        const duplicated = state.projects.some(
          (project) => project.id !== projectId && project.name.trim().toLowerCase() === nextName.toLowerCase()
        );
        if (duplicated) {
          return { ok: false, reason: "같은 이름의 프로젝트가 이미 있습니다." };
        }

        const nextDescription = input.description === undefined ? targetProject.description : input.description.trim();
        set((prevState) => ({
          projects: prevState.projects.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  name: nextName,
                  description: nextDescription
                }
              : project
          )
        }));

        return { ok: true };
      },

      setProjectMemberRole: (projectId, userId, role: ProjectMemberRole) => {
        const state = get();
        const actor = getCurrentUserFromState(state);
        if (!actor) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const project = state.projects.find((item) => item.id === projectId);
        if (!project) {
          return { ok: false, reason: "프로젝트를 찾지 못했습니다." };
        }

        const targetUserExists = state.users.some((user) => user.id === userId);
        if (!targetUserExists) {
          return { ok: false, reason: "사용자를 찾지 못했습니다." };
        }

        const canMutateProjectMembers = canManageProjectMembers({
          actor,
          projectId,
          projectMemberships: state.projectMemberships,
          projects: state.projects
        });

        if (!canMutateProjectMembers) {
          return { ok: false, reason: "프로젝트 구성원 권한을 변경할 수 없습니다." };
        }

        const updatedAt = nowIso();
        const targetMembership = state.projectMemberships.find((membership) => membership.projectId === projectId && membership.userId === userId);
        const demotedOwnerRole: ProjectMemberRole = "write";

        set((prevState) => {
          const nextProjects =
            role === "owner"
              ? prevState.projects.map((item) =>
                  item.id === projectId
                    ? {
                        ...item,
                        ownerId: userId
                      }
                    : item
                )
              : prevState.projects;

          const nextProjectMemberships: VisualKanbanState["projectMemberships"] = targetMembership
            ? prevState.projectMemberships.map((membership) =>
                membership.id === targetMembership.id
                  ? {
                      ...membership,
                      role,
                      updatedAt
                    }
                  : role === "owner" && membership.projectId === projectId && membership.role === "owner"
                    ? {
                        ...membership,
                        role: demotedOwnerRole,
                        updatedAt
                      }
                    : membership
              )
            : [
                {
                  id: uid("project-member"),
                  projectId,
                  userId,
                  role,
                  updatedAt
                },
                ...prevState.projectMemberships.map((membership) =>
                  role === "owner" && membership.projectId === projectId && membership.role === "owner"
                    ? {
                        ...membership,
                        role: demotedOwnerRole,
                        updatedAt
                      }
                    : membership
                )
              ];

          return {
            projects: nextProjects,
            projectMemberships: nextProjectMemberships
          };
        });

        return { ok: true };
      },

      deleteProject: (projectId) => {
        const state = get();
        const actor = getCurrentUserFromState(state);
        if (!actor) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const project = state.projects.find((item) => item.id === projectId);
        if (!project) {
          return { ok: false, reason: "프로젝트를 찾지 못했습니다." };
        }

        const actorMemberRole = resolveProjectMemberRole({
          user: actor,
          projectId,
          projectMemberships: state.projectMemberships,
          projects: state.projects
        });

        if (actorMemberRole !== "owner" && actorMemberRole !== "write") {
          return { ok: false, reason: "프로젝트 참여자(Owner/Write)만 삭제할 수 있습니다." };
        }

        set((prevState) => ({
          projects: prevState.projects.filter((item) => item.id !== projectId),
          projectMemberships: prevState.projectMemberships.filter((membership) => membership.projectId !== projectId),
          permissions: prevState.permissions.filter((permission) => permission.projectId !== projectId),
          tasks: prevState.tasks.filter((task) => task.projectId !== projectId),
          kanbanTasks: prevState.kanbanTasks.filter((task) => task.projectId !== projectId),
          kanbanHistory: prevState.kanbanHistory.filter((historyItem) => historyItem.projectId !== projectId),
          whiteboardScenes: prevState.whiteboardScenes.filter((scene) => scene.projectId !== projectId),
          recentProjectIdByAccountId: Object.fromEntries(
            Object.entries(prevState.recentProjectIdByAccountId).filter(([, recentProjectId]) => recentProjectId !== projectId)
          )
        }));

        return { ok: true };
      },

      addTodo: (input: AddTodoInput) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const title = input.title.trim();
        if (!title) {
          return { ok: false, reason: "할 일 제목을 입력해 주세요." };
        }

        const createdAt = nowIso();
        const newTodo: PersonalTodo = {
          id: uid("todo"),
          ownerId: currentUserId,
          title,
          description: input.description?.trim() ?? "",
          completed: false,
          completedAt: null,
          priority: normalizeTodoPriority(input.priority),
          recurrence: normalizeTodoRecurrence(input.recurrence),
          repeatColor: normalizeTodoRepeatColor(input.repeatColor),
          createdAt,
          updatedAt: createdAt
        };

        set((state) => ({
          personalTodos: applyTodoLifecycle([newTodo, ...state.personalTodos], currentUserId).todos
        }));

        return { ok: true, todoId: newTodo.id };
      },

      updateTodo: (todoId, patch: UpdateTodoInput) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const target = get().personalTodos.find((todo) => todo.id === todoId);
        if (!target) {
          return { ok: false, reason: "할 일을 찾지 못했습니다." };
        }
        if (target.ownerId !== currentUserId) {
          return { ok: false, reason: "본인 할 일만 수정할 수 있습니다." };
        }

        if (patch.title !== undefined && !patch.title.trim()) {
          return { ok: false, reason: "할 일 제목을 입력해 주세요." };
        }

        const updatedAt = nowIso();
        set((state) => ({
          personalTodos: applyTodoLifecycle(
            state.personalTodos.map((todo) => {
              if (todo.id !== todoId) return todo;

              const nextCompleted = patch.completed ?? todo.completed;
              const nextCompletedAt =
                !nextCompleted ? null : todo.completedAt ? todo.completedAt : updatedAt;

              return {
                ...todo,
                title: patch.title === undefined ? todo.title : patch.title.trim(),
                description: patch.description === undefined ? todo.description : patch.description.trim(),
                priority: patch.priority === undefined ? todo.priority : normalizeTodoPriority(patch.priority),
                recurrence: patch.recurrence === undefined ? todo.recurrence : normalizeTodoRecurrence(patch.recurrence),
                repeatColor: patch.repeatColor === undefined ? todo.repeatColor : normalizeTodoRepeatColor(patch.repeatColor),
                completed: nextCompleted,
                completedAt: nextCompletedAt,
                updatedAt
              };
            }),
            currentUserId
          ).todos
        }));

        return { ok: true };
      },

      toggleTodo: (todoId, forceCompleted) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const target = get().personalTodos.find((todo) => todo.id === todoId);
        if (!target) {
          return { ok: false, reason: "할 일을 찾지 못했습니다." };
        }
        if (target.ownerId !== currentUserId) {
          return { ok: false, reason: "본인 할 일만 수정할 수 있습니다." };
        }

        const nextCompleted = typeof forceCompleted === "boolean" ? forceCompleted : !target.completed;
        const updatedAt = nowIso();

        set((state) => ({
          personalTodos: applyTodoLifecycle(
            state.personalTodos.map((todo) =>
              todo.id === todoId
                ? {
                    ...todo,
                    completed: nextCompleted,
                    completedAt: nextCompleted ? updatedAt : null,
                    updatedAt
                  }
                : todo
            ),
            currentUserId
          ).todos
        }));

        return { ok: true };
      },

      removeTodo: (todoId) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const target = get().personalTodos.find((todo) => todo.id === todoId);
        if (!target) {
          return { ok: false, reason: "할 일을 찾지 못했습니다." };
        }
        if (target.ownerId !== currentUserId) {
          return { ok: false, reason: "본인 할 일만 삭제할 수 있습니다." };
        }

        set((state) => ({
          personalTodos: state.personalTodos.filter((todo) => todo.id !== todoId)
        }));

        return { ok: true };
      },

      cleanupTodos: () => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) {
          return { removed: 0, reactivated: 0 };
        }

        const lifecycle = applyTodoLifecycle(get().personalTodos, currentUserId);
        if (lifecycle.removed > 0 || lifecycle.reactivated > 0) {
          set({ personalTodos: lifecycle.todos });
        }

        return { removed: lifecycle.removed, reactivated: lifecycle.reactivated };
      },

      saveWhiteboardScene: (projectId: string, scene: WhiteboardSceneData) => {
        const state = get();
        const currentUserId = state.currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const projectExists = state.projects.some((project) => project.id === projectId);
        if (!projectExists) {
          return { ok: false, reason: "프로젝트를 찾지 못했습니다." };
        }
        if (
          !canCurrentUserWriteFeature({
            state,
            projectId,
            feature: "whiteboard"
          })
        ) {
          return { ok: false, reason: "화이트보드 편집 권한이 없습니다." };
        }

        const normalizedScene: WhiteboardSceneData = {
          elements: Array.isArray(scene.elements) ? scene.elements : [],
          appState: scene.appState && typeof scene.appState === "object" ? scene.appState : null,
          files: scene.files && typeof scene.files === "object" ? scene.files : null
        };

        const updatedAt = nowIso();
        set((state) => {
          const existing = state.whiteboardScenes.find((item) => item.projectId === projectId);
          if (!existing) {
            return {
              whiteboardScenes: [
                {
                  id: uid("whiteboard"),
                  projectId,
                  scene: normalizedScene,
                  updatedAt,
                  updatedBy: currentUserId
                },
                ...state.whiteboardScenes
              ]
            };
          }

          return {
            whiteboardScenes: state.whiteboardScenes.map((item) =>
              item.projectId === projectId
                ? {
                    ...item,
                    scene: normalizedScene,
                    updatedAt,
                    updatedBy: currentUserId
                  }
                : item
            )
          };
        });

        return { ok: true };
      },

      addTask: (input) => {
        const state = get();
        const currentUserId = state.currentUserId;
        if (!currentUserId) return;
        if (
          !canCurrentUserWriteFeature({
            state,
            projectId: input.projectId,
            feature: "gantt"
          })
        ) {
          return;
        }

        const tasks = state.tasks;
        const normalizedParentTaskId =
          input.parentTaskId && tasks.some((task) => task.id === input.parentTaskId && task.projectId === input.projectId)
            ? input.parentTaskId
            : undefined;
        const siblingMaxOrder = tasks
          .filter((task) => task.projectId === input.projectId && task.parentTaskId === normalizedParentTaskId)
          .reduce((max, task) => Math.max(max, task.order ?? -1), -1);
        const normalizedOrder = Number.isFinite(input.order) ? Math.max(0, Math.trunc(input.order ?? 0)) : siblingMaxOrder + 1;
        const participantIds = [...new Set([...(input.participantIds ?? []), input.assigneeId].filter(Boolean))];

        const newTask: Task = {
          id: uid("task"),
          projectId: input.projectId,
          title: input.title,
          description: input.description,
          status: "backlog",
          priority: input.priority,
          assigneeId: input.assigneeId,
          participantIds,
          reporterId: currentUserId,
          ownerId: currentUserId,
          dueDate: input.dueDate,
          startDate: input.startDate ?? nowIso(),
          endDate: input.endDate ?? input.dueDate,
          parentTaskId: normalizedParentTaskId,
          order: normalizedOrder,
          visibility: input.visibility,
          tags: [],
          updatedAt: nowIso()
        };

        set((state) => ({
          tasks: [newTask, ...state.tasks],
          activities: [makeActivity({ actorId: currentUserId, type: "task_create", message: `태스크 생성: ${input.title}` }), ...state.activities].slice(
            0,
            200
          )
        }));
      },

      addKanbanTask: (input) => {
        const state = get();
        const currentUserId = state.currentUserId;
        if (!currentUserId) return;
        if (
          !canCurrentUserWriteFeature({
            state,
            projectId: input.projectId,
            feature: "kanban"
          })
        ) {
          return;
        }

        const kanbanTasks = state.kanbanTasks;
        const normalizedParentTaskId =
          input.parentTaskId && kanbanTasks.some((task) => task.id === input.parentTaskId && task.projectId === input.projectId)
            ? input.parentTaskId
            : undefined;
        const siblingMaxOrder = kanbanTasks
          .filter((task) => task.projectId === input.projectId && task.parentTaskId === normalizedParentTaskId)
          .reduce((max, task) => Math.max(max, task.order ?? -1), -1);
        const normalizedOrder = Number.isFinite(input.order) ? Math.max(0, Math.trunc(input.order ?? 0)) : siblingMaxOrder + 1;
        const participantIds = [...new Set([...(input.participantIds ?? []), input.assigneeId].filter(Boolean))];
        const rawTags = input.tags ?? [];

        const newTask = applyKanbanStage(
          {
            id: uid("kanban-task"),
            projectId: input.projectId,
            title: input.title,
            description: input.description,
            status: "backlog",
            priority: input.priority,
            assigneeId: input.assigneeId,
            participantIds,
            reporterId: currentUserId,
            ownerId: input.ownerId ?? currentUserId,
            dueDate: input.dueDate,
            startDate: input.startDate ?? nowIso(),
            endDate: input.endDate ?? input.dueDate,
            parentTaskId: normalizedParentTaskId,
            order: normalizedOrder,
            visibility: input.visibility,
            tags: [...rawTags],
            updatedAt: nowIso()
          },
          input.status ?? "todo",
          rawTags
        );

        set((state) => ({
          kanbanTasks: [newTask, ...state.kanbanTasks],
          activities: [
            makeActivity({ actorId: currentUserId, type: "task_create", message: `칸반 태스크 생성: ${input.title}` }),
            ...state.activities
          ].slice(0, 200)
        }));
      },

      updateKanbanTask: (taskId, patch: KanbanTaskPatch) => {
        const state = get();
        const currentUserId = state.currentUserId;
        if (!currentUserId) return;
        const target = state.kanbanTasks.find((task) => task.id === taskId);
        if (!target) return;
        if (
          !canCurrentUserWriteFeature({
            state,
            projectId: target.projectId,
            feature: "kanban"
          })
        ) {
          return;
        }

        set((state) => ({
          kanbanTasks: state.kanbanTasks.map((task) => {
            if (task.id !== taskId) return task;

            const { status, tags, ...restPatch } = patch;
            const mergedTask: Task = {
              ...task,
              ...restPatch,
              tags: tags ? [...tags] : task.tags
            };

            return applyKanbanStage(mergedTask, status ?? getKanbanStage(task), mergedTask.tags);
          })
        }));
      },

      moveKanbanTask: (taskId, nextStatus) => {
        const state = get();
        const currentUserId = state.currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const target = state.kanbanTasks.find((task) => task.id === taskId);
        if (!target) return { ok: false, reason: "태스크를 찾지 못했습니다." };
        if (
          !canCurrentUserWriteFeature({
            state,
            projectId: target.projectId,
            feature: "kanban"
          })
        ) {
          return { ok: false, reason: "칸반 편집 권한이 없습니다." };
        }

        set((state) => ({
          kanbanTasks: state.kanbanTasks.map((task) => (task.id === taskId ? applyKanbanStage(task, nextStatus) : task))
        }));

        return { ok: true };
      },

      finalizeKanbanTask: (taskId) => {
        const state = get();
        const currentUserId = state.currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const target = state.kanbanTasks.find((task) => task.id === taskId);
        if (!target) {
          return { ok: false, reason: "태스크를 찾지 못했습니다." };
        }
        if (
          !canCurrentUserWriteFeature({
            state,
            projectId: target.projectId,
            feature: "kanban"
          })
        ) {
          return { ok: false, reason: "칸반 편집 권한이 없습니다." };
        }
        if (target.status !== "done") {
          return { ok: false, reason: "Done 상태에서만 보관할 수 있습니다." };
        }

        const historyItem: KanbanHistoryItem = {
          id: uid("kanban-history"),
          projectId: target.projectId,
          task: cloneTaskSnapshot({
            ...target,
            tags: target.tags.filter((tag) => tag !== KANBAN_TODO_TAG)
          }),
          finalizedAt: nowIso(),
          finalizedBy: currentUserId
        };

        set((state) => ({
          kanbanTasks: state.kanbanTasks.filter((task) => task.id !== taskId),
          kanbanHistory: trimKanbanHistoryByProject([historyItem, ...state.kanbanHistory]),
          activities: [
            makeActivity({ actorId: currentUserId, type: "task_move", message: `칸반 완료 보관: ${target.title}` }),
            ...state.activities
          ].slice(0, 200)
        }));

        return { ok: true };
      },

      restoreKanbanTask: (historyId) => {
        const state = get();
        const currentUserId = state.currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const target = state.kanbanHistory.find((item) => item.id === historyId);
        if (!target) {
          return { ok: false, reason: "보관된 태스크를 찾지 못했습니다." };
        }
        if (
          !canCurrentUserWriteFeature({
            state,
            projectId: target.projectId,
            feature: "kanban"
          })
        ) {
          return { ok: false, reason: "칸반 편집 권한이 없습니다." };
        }

        set((state) => {
          const idInUse = state.kanbanTasks.some((task) => task.id === target.task.id);
          const restoredTaskBase: Task = {
            ...cloneTaskSnapshot(target.task),
            id: idInUse ? uid("kanban-task") : target.task.id,
            status: "done",
            tags: target.task.tags.filter((tag) => tag !== KANBAN_TODO_TAG),
            updatedAt: nowIso()
          };

          return {
            kanbanTasks: [applyKanbanStage(restoredTaskBase, "done", restoredTaskBase.tags), ...state.kanbanTasks],
            kanbanHistory: state.kanbanHistory.filter((item) => item.id !== historyId),
            activities: [
              makeActivity({ actorId: currentUserId, type: "task_move", message: `칸반 보관 복원: ${target.task.title}` }),
              ...state.activities
            ].slice(0, 200)
          };
        });

        return { ok: true };
      },

      moveTask: (taskId, nextStatus: TaskStatus) => {
        const state = get();
        const currentUserId = state.currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const target = state.tasks.find((task) => task.id === taskId);
        if (!target) return { ok: false, reason: "태스크를 찾지 못했습니다." };
        if (
          !canCurrentUserWriteFeature({
            state,
            projectId: target.projectId,
            feature: "gantt"
          })
        ) {
          return { ok: false, reason: "간트 편집 권한이 없습니다." };
        }

        set((state) => ({
          tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, status: nextStatus, updatedAt: nowIso() } : task)),
          activities: [makeActivity({ actorId: currentUserId, type: "task_move", message: `${target.title} → ${nextStatus}` }), ...state.activities].slice(
            0,
            200
          )
        }));

        return { ok: true };
      },

      updateTask: (taskId, patch) => {
        const state = get();
        const currentUserId = state.currentUserId;
        if (!currentUserId) return;
        const target = state.tasks.find((task) => task.id === taskId);
        if (!target) return;
        if (
          !canCurrentUserWriteFeature({
            state,
            projectId: target.projectId,
            feature: "gantt"
          })
        ) {
          return;
        }

        set((state) => ({
          tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, ...patch, updatedAt: nowIso() } : task))
        }));
      },

      removeTask: (taskId) => {
        const state = get();
        const currentUserId = state.currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const target = state.tasks.find((task) => task.id === taskId);
        if (!target) {
          return { ok: false, reason: "태스크를 찾지 못했습니다." };
        }
        if (
          !canCurrentUserWriteFeature({
            state,
            projectId: target.projectId,
            feature: "gantt"
          })
        ) {
          return { ok: false, reason: "간트 편집 권한이 없습니다." };
        }

        const removedTaskIds = collectTaskAndDescendantIds(state.tasks, taskId);
        const removedTaskIdSet = new Set(removedTaskIds);

        set((state) => ({
          tasks: state.tasks.filter((task) => !removedTaskIdSet.has(task.id)),
          activities: [
            makeActivity({
              actorId: currentUserId,
              type: "task_move",
              message: `태스크 삭제: ${target.title}${removedTaskIds.length > 1 ? ` (+${removedTaskIds.length - 1} 하위)` : ""}`
            }),
            ...state.activities
          ].slice(0, 200)
        }));

        return { ok: true, removedTaskIds };
      },

      setPermission: (projectId, feature, userId, role: AccessRole) => {
        const state = get();
        const actor = getCurrentUserFromState(state);
        if (!actor) return;

        const canMutatePermission = canManageProjectMembers({
          actor,
          projectId,
          projectMemberships: state.projectMemberships,
          projects: state.projects
        });
        if (!canMutatePermission) return;

        set((state) => {
          const existing = state.permissions.find(
            (perm) => perm.projectId === projectId && perm.feature === feature && perm.userId === userId
          );

          const permissions = existing
            ? state.permissions.map((perm) =>
                perm.id === existing.id
                  ? {
                      ...perm,
                      role,
                      updatedAt: nowIso()
                    }
                  : perm
              )
            : [
                {
                  id: uid("perm"),
                  projectId,
                  feature,
                  userId,
                  role,
                  updatedAt: nowIso()
                },
                ...state.permissions
              ];

          return {
            permissions,
            activities: [
              makeActivity({
                actorId: actor.id,
                type: "permission_change",
                message: `${feature} 권한 변경: ${userId} -> ${role}`
              }),
              ...state.activities
            ].slice(0, 200)
          };
        });
      },

      ensureSessionCheck: () => {
        const currentUserId = get().currentUserId;
        set((state) => {
          const fallbackPreference = currentUserId
            ? resolveWorkspaceFallbackForAccount({
                accountId: currentUserId,
                workspacePreferencesByAccountId: state.workspacePreferencesByAccountId,
                fallbackLanguage: state.workspaceLanguage,
                fallbackStyle: state.workspaceStyle
              })
            : null;
          const resolvedWorkspacePreference = currentUserId
            ? resolveAccountWorkspacePreference({
                accountId: currentUserId,
                workspacePreferencesByAccountId: state.workspacePreferencesByAccountId,
                fallbackLanguage: fallbackPreference?.language ?? state.workspaceLanguage,
                fallbackStyle: fallbackPreference?.style ?? state.workspaceStyle
              })
            : null;
          const existingWorkspacePreference = currentUserId ? state.workspacePreferencesByAccountId[currentUserId] : undefined;
          const nextWorkspacePreferencesByAccountId =
            currentUserId && resolvedWorkspacePreference && shouldUpdateAccountWorkspacePreference(existingWorkspacePreference, resolvedWorkspacePreference)
              ? {
                  ...state.workspacePreferencesByAccountId,
                  [currentUserId]: resolvedWorkspacePreference
                }
              : state.workspacePreferencesByAccountId;

          return {
            sessionCheckedAt: nowIso(),
            personalTodos: currentUserId ? applyTodoLifecycle(state.personalTodos, currentUserId).todos : state.personalTodos,
            connectedUserIds:
              currentUserId && !state.connectedUserIds.includes(currentUserId)
                ? [...state.connectedUserIds, currentUserId]
                : state.connectedUserIds,
            workspaceLanguage: resolvedWorkspacePreference?.language ?? normalizeWorkspaceLanguage(state.workspaceLanguage),
            workspaceStyle: resolvedWorkspacePreference?.style ?? normalizeWorkspaceStyle(state.workspaceStyle),
            workspacePreferencesByAccountId: nextWorkspacePreferencesByAccountId
          };
        });
      },

      setWorkspaceLanguage: (nextLanguage) => {
        set((state) => {
          const normalizedLanguage = normalizeWorkspaceLanguage(nextLanguage);
          const currentUserId = state.currentUserId;
          if (!currentUserId) {
            return { workspaceLanguage: normalizedLanguage };
          }

          const existingWorkspacePreference = resolveAccountWorkspacePreference({
            accountId: currentUserId,
            workspacePreferencesByAccountId: state.workspacePreferencesByAccountId,
            fallbackLanguage: state.workspaceLanguage,
            fallbackStyle: state.workspaceStyle
          });
          const nextWorkspacePreference: AccountWorkspacePreference = {
            ...existingWorkspacePreference,
            language: normalizedLanguage
          };

          return {
            workspaceLanguage: normalizedLanguage,
            workspacePreferencesByAccountId: {
              ...state.workspacePreferencesByAccountId,
              [currentUserId]: nextWorkspacePreference
            }
          };
        });
      },

      setWorkspaceStyle: (nextStyle) => {
        set((state) => {
          const normalizedStyle = normalizeWorkspaceStyle(nextStyle);
          const currentUserId = state.currentUserId;
          if (!currentUserId) {
            return { workspaceStyle: normalizedStyle };
          }

          const existingWorkspacePreference = resolveAccountWorkspacePreference({
            accountId: currentUserId,
            workspacePreferencesByAccountId: state.workspacePreferencesByAccountId,
            fallbackLanguage: state.workspaceLanguage,
            fallbackStyle: state.workspaceStyle
          });
          const nextWorkspacePreference: AccountWorkspacePreference = {
            ...existingWorkspacePreference,
            style: normalizedStyle
          };

          return {
            workspaceStyle: normalizedStyle,
            workspacePreferencesByAccountId: {
              ...state.workspacePreferencesByAccountId,
              [currentUserId]: nextWorkspacePreference
            }
          };
        });
      },

      setRecentProjectForCurrentAccount: (projectId) => {
        const currentUserId = get().currentUserId;
        const normalizedProjectId = projectId.trim();

        if (!currentUserId || !normalizedProjectId) {
          return;
        }

        const state = get();
        const projectExists = state.projects.some((project) => project.id === normalizedProjectId);
        if (!projectExists || state.recentProjectIdByAccountId[currentUserId] === normalizedProjectId) {
          return;
        }

        set((prevState) => ({
          recentProjectIdByAccountId: {
            ...prevState.recentProjectIdByAccountId,
            [currentUserId]: normalizedProjectId
          }
        }));
      },

      replaceSharedState: (snapshot) => {
        set((state) => {
          const mergedSharedState = mergeSharedStateSnapshot(state, snapshot);
          const currentUserId = state.currentUserId;

          if (!currentUserId) {
            return mergedSharedState;
          }

          const resolvedWorkspacePreference = resolveAccountWorkspacePreference({
            accountId: currentUserId,
            workspacePreferencesByAccountId: mergedSharedState.workspacePreferencesByAccountId,
            fallbackLanguage: state.workspaceLanguage,
            fallbackStyle: state.workspaceStyle
          });

          return {
            ...mergedSharedState,
            workspaceLanguage: resolvedWorkspacePreference.language,
            workspaceStyle: resolvedWorkspacePreference.style
          };
        });
      },

      getSharedStateSnapshot: () => getSharedStateSnapshot(get())
    }),
    {
      name: "visual-kanban-state",
      storage: persistStorage,
      merge: (persistedState, currentState) => {
        const persistedRecord = (persistedState as Record<string, unknown>) ?? {};
        const persistedSeedRevisionRaw = persistedRecord.seedRevision;
        const persistedSeedRevision =
          typeof persistedSeedRevisionRaw === "number" && Number.isFinite(persistedSeedRevisionRaw)
            ? Math.trunc(persistedSeedRevisionRaw)
            : typeof persistedSeedRevisionRaw === "string" && persistedSeedRevisionRaw.trim().length > 0
              ? Math.trunc(Number.parseInt(persistedSeedRevisionRaw, 10))
              : null;

        if (persistedSeedRevision !== CURRENT_SEED_REVISION) {
          return sanitizeLegacySeedAccounts(currentState);
        }

        const persistedEntries = Object.entries(persistedRecord).filter(([key]) => key in currentState);
        const restPersistedState = Object.fromEntries(persistedEntries);

        return sanitizeLegacySeedAccounts({
          ...currentState,
          ...(restPersistedState as Partial<VisualKanbanState>)
        } as VisualKanbanState);
      },
      partialize: (state) => ({
        seedRevision: state.seedRevision,
        users: state.users,
        projects: state.projects,
        projectMemberships: state.projectMemberships,
        permissions: state.permissions,
        personalTodos: state.personalTodos,
        tasks: state.tasks,
        kanbanTasks: state.kanbanTasks,
        kanbanHistory: state.kanbanHistory,
        whiteboardScenes: state.whiteboardScenes,
        activities: state.activities,
        currentUserId: state.currentUserId,
        connectedUserIds: state.connectedUserIds,
        sessionCheckedAt: state.sessionCheckedAt,
        workspaceLanguage: state.workspaceLanguage,
        workspaceStyle: state.workspaceStyle,
        workspacePreferencesByAccountId: state.workspacePreferencesByAccountId,
        recentProjectIdByAccountId: state.recentProjectIdByAccountId
      })
    }
  )
);

export function getCurrentUser(users: User[], currentUserId: string | null) {
  if (!currentUserId) return null;
  return users.find((user) => user.id === currentUserId) ?? null;
}

export function getEffectiveRoleForFeature({
  user,
  projectId,
  feature,
  permissions,
  projectMemberships,
  projects
}: {
  user: User | null;
  projectId: string;
  feature: FeatureKey;
  permissions: VisualKanbanState["permissions"];
  projectMemberships: VisualKanbanState["projectMemberships"];
  projects: VisualKanbanState["projects"];
}) {
  return resolveRole({
    user,
    projectId,
    feature,
    assignments: permissions,
    projectMemberships,
    projects
  });
}

export function getVisibleTasks({
  tasks,
  user,
  role
}: {
  tasks: Task[];
  user: User | null;
  role: ReturnType<typeof resolveRole>;
}) {
  return tasks.filter((task) => canSeeTask(user, task, role));
}

export function getVisiblePersonalTodos({
  todos,
  currentUserId
}: {
  todos: PersonalTodo[];
  currentUserId: string | null;
}) {
  if (!currentUserId) return [];
  return todos.filter((todo) => todo.ownerId === currentUserId);
}
