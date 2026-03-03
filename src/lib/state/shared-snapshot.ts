import {
  SEED_DATA_REVISION,
  seedActivities,
  seedKanbanHistory,
  seedKanbanTasks,
  seedPersonalTodos,
  seedPermissions,
  seedProjectMemberships,
  seedProjects,
  seedTasks,
  seedUsers,
  seedWhiteboardScenes
} from "@/lib/data/seed";
import type {
  AccessRole,
  AccountWorkspacePreference,
  Activity,
  FeatureKey,
  PermissionAssignment,
  PersonalTodo,
  Project,
  ProjectMembership,
  ProjectMemberRole,
  TaskAttachment,
  TaskAttachmentKind,
  TaskComment,
  Task,
  TaskPriority,
  TaskStatus,
  TodoPriority,
  TodoRecurrence,
  TodoRecurrenceType,
  TodoWeekday,
  User,
  VisualKanbanSharedSnapshot,
  WhiteboardScene,
  WhiteboardSceneData,
  WorkspaceLanguage,
  WorkspaceStyle
} from "@/lib/types";

const DEFAULT_WORKSPACE_LANGUAGE: WorkspaceLanguage = "ko";
const DEFAULT_WORKSPACE_STYLE: WorkspaceStyle = "neo-classic";
const CURRENT_SEED_REVISION = SEED_DATA_REVISION;

export const DEFAULT_WORKSPACE_ID = "main";
const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

const BASE_ROLE_SET = new Set<User["baseRole"]>(["admin", "editor", "viewer"]);
const PROJECT_MEMBER_ROLE_SET = new Set<ProjectMemberRole>(["owner", "write", "read"]);
const ACCESS_ROLE_SET = new Set<AccessRole>(["admin", "editor", "viewer", "private"]);
const TASK_STATUS_SET = new Set<TaskStatus>(["backlog", "in_progress", "done"]);
const TASK_PRIORITY_SET = new Set<TaskPriority>(["low", "medium", "high"]);
const TASK_ATTACHMENT_KIND_SET = new Set<TaskAttachmentKind>(["image", "document"]);
const TODO_RECURRENCE_TYPE_SET = new Set<TodoRecurrenceType>(["none", "daily", "weekly"]);
const FEATURE_KEY_SET = new Set<FeatureKey>(["project", "kanban", "whiteboard", "gantt", "taskboard", "todo", "search"]);
const ACTIVITY_TYPE_SET = new Set<Activity["type"]>(["login", "task_move", "permission_change", "task_create"]);
const WORKSPACE_STYLE_SET = new Set<WorkspaceStyle>(["neo-classic", "neo-vivid", "modern-light", "modern-brown"]);

export type SharedWorkspaceState = VisualKanbanSharedSnapshot;

export interface SharedWorkspaceSnapshot {
  workspaceId: string;
  version: number;
  state: SharedWorkspaceState;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value;
}

function asOptionalString(value: unknown): string | undefined {
  const normalized = asString(value)?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const next = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return [...new Set(next)];
}

function asIsoString(value: unknown, fallback: string) {
  const next = asString(value)?.trim();
  return next && next.length > 0 ? next : fallback;
}

function asOptionalIsoString(value: unknown): string | null {
  const next = asString(value)?.trim();
  return next && next.length > 0 ? next : null;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeWorkspaceLanguage(value: unknown): WorkspaceLanguage {
  return value === "en" ? "en" : DEFAULT_WORKSPACE_LANGUAGE;
}

function normalizeWorkspaceStyle(value: unknown): WorkspaceStyle {
  if (typeof value !== "string") {
    return DEFAULT_WORKSPACE_STYLE;
  }

  const legacyAlias = value === "warm-brown" ? "modern-brown" : value === "modern-dark" ? "modern-light" : value;
  return WORKSPACE_STYLE_SET.has(legacyAlias as WorkspaceStyle) ? (legacyAlias as WorkspaceStyle) : DEFAULT_WORKSPACE_STYLE;
}

function normalizePermissionFeature(value: unknown): FeatureKey | null {
  if (typeof value !== "string") {
    return null;
  }

  if (value === "mindmap") {
    return "whiteboard";
  }

  if (value === "comments") {
    return null;
  }

  return FEATURE_KEY_SET.has(value as FeatureKey) ? (value as FeatureKey) : null;
}

function normalizeActivityType(value: unknown): Activity["type"] | null {
  if (typeof value !== "string") {
    return null;
  }

  if (value === "comment_add") {
    return null;
  }

  return ACTIVITY_TYPE_SET.has(value as Activity["type"]) ? (value as Activity["type"]) : null;
}

function normalizeTodoPriority(value: unknown): TodoPriority {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 4;
  }

  const normalized = Math.max(1, Math.min(7, Math.trunc(value)));
  return normalized as TodoPriority;
}

function normalizeTodoRecurrence(value: unknown): TodoRecurrence {
  const record = asRecord(value);
  const type = record?.type;

  if (!TODO_RECURRENCE_TYPE_SET.has(type as TodoRecurrenceType) || type === "none") {
    return { type: "none" };
  }

  if (type === "daily") {
    return { type: "daily" };
  }

  const weekdays = asStringArray((record as Record<string, unknown>).weekdays)
    .map((weekday) => Number.parseInt(weekday, 10))
    .filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)
    .map((weekday) => weekday as TodoWeekday);

  if (weekdays.length === 0 && Array.isArray(record?.weekdays)) {
    const numericWeekdays = (record?.weekdays as unknown[])
      .map((weekday) => (typeof weekday === "number" ? Math.trunc(weekday) : Number.NaN))
      .filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)
      .map((weekday) => weekday as TodoWeekday);
    if (numericWeekdays.length > 0) {
      return { type: "weekly", weekdays: [...new Set(numericWeekdays)].sort((left, right) => left - right) };
    }
  }

  return weekdays.length > 0 ? { type: "weekly", weekdays: [...new Set(weekdays)].sort((left, right) => left - right) } : { type: "none" };
}

function sanitizeCollection<T>(value: unknown, fallback: T[], coerce: (entry: unknown) => T | null): T[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.map((entry) => coerce(entry)).filter((entry): entry is T => entry !== null);
}

function createFileDownloadUrl(fileId: string) {
  return `/api/files/${encodeURIComponent(fileId)}`;
}

function cloneTaskAttachment(attachment: TaskAttachment): TaskAttachment {
  const mimeType = attachment.mimeType || "application/octet-stream";
  const fileId = asOptionalString(attachment.fileId);
  const url = asOptionalString(attachment.url) ?? (fileId ? createFileDownloadUrl(fileId) : undefined);
  const dataUrl = asOptionalString(attachment.dataUrl);

  return {
    ...attachment,
    mimeType,
    kind: attachment.kind ?? (mimeType.startsWith("image/") ? "image" : "document"),
    size: Number.isFinite(attachment.size) ? Math.max(0, Math.trunc(attachment.size)) : 0,
    fileId,
    url,
    dataUrl
  };
}

function cloneTaskComment(comment: TaskComment): TaskComment {
  return {
    ...comment,
    taskId: comment.taskId || "unknown-task",
    attachments: comment.attachments.map(cloneTaskAttachment)
  };
}

function cloneTask(task: Task): Task {
  return {
    ...task,
    participantIds: task.participantIds ? [...task.participantIds] : undefined,
    tags: [...task.tags],
    attachments: task.attachments?.map(cloneTaskAttachment),
    comments: task.comments?.map(cloneTaskComment)
  };
}

function cloneWhiteboardScene(scene: WhiteboardScene): WhiteboardScene {
  return {
    ...scene,
    scene: {
      elements: [...scene.scene.elements],
      appState: scene.scene.appState ? { ...scene.scene.appState } : null,
      files: scene.scene.files ? { ...scene.scene.files } : null
    }
  };
}

export function createSeedSharedWorkspaceState(): SharedWorkspaceState {
  return {
    seedRevision: CURRENT_SEED_REVISION,
    users: seedUsers.map((user) => ({ ...user })),
    projects: seedProjects.map((project) => ({ ...project })),
    projectMemberships: seedProjectMemberships.map((membership) => ({ ...membership })),
    permissions: seedPermissions.map((permission) => ({ ...permission })),
    personalTodos: seedPersonalTodos.map((todo) => ({
      ...todo,
      recurrence:
        todo.recurrence.type === "weekly" ? { type: "weekly", weekdays: [...todo.recurrence.weekdays] } : { ...todo.recurrence }
    })),
    tasks: seedTasks.map(cloneTask),
    kanbanTasks: seedKanbanTasks.map(cloneTask),
    kanbanHistory: seedKanbanHistory.map((historyItem) => ({
      ...historyItem,
      task: cloneTask(historyItem.task)
    })),
    whiteboardScenes: seedWhiteboardScenes.map(cloneWhiteboardScene),
    activities: seedActivities.map((activity) => ({ ...activity })),
    workspacePreferencesByAccountId: {},
    recentProjectIdByAccountId: {}
  };
}

function coerceUser(entry: unknown): User | null {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const id = asOptionalString(record.id);
  const username = asOptionalString(record.username);
  const displayName = asOptionalString(record.displayName);
  const password = asOptionalString(record.password);

  if (!id || !username || !displayName || !password) {
    return null;
  }

  const baseRole = BASE_ROLE_SET.has(record.baseRole as User["baseRole"]) ? (record.baseRole as User["baseRole"]) : "viewer";

  return {
    id,
    username,
    displayName,
    part: asOptionalString(record.part),
    icon: asOptionalString(record.icon),
    password,
    mustChangePassword: asBoolean(record.mustChangePassword, false),
    baseRole
  };
}

function coerceProject(entry: unknown): Project | null {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const id = asOptionalString(record.id);
  const name = asOptionalString(record.name);
  const description = asString(record.description) ?? "";
  const ownerId = asOptionalString(record.ownerId);

  if (!id || !name || !ownerId) {
    return null;
  }

  return {
    id,
    name,
    description,
    ownerId
  };
}

function coerceProjectMembership(entry: unknown): ProjectMembership | null {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const id = asOptionalString(record.id);
  const projectId = asOptionalString(record.projectId);
  const userId = asOptionalString(record.userId);

  if (!id || !projectId || !userId) {
    return null;
  }

  const role = PROJECT_MEMBER_ROLE_SET.has(record.role as ProjectMemberRole) ? (record.role as ProjectMemberRole) : "read";

  return {
    id,
    projectId,
    userId,
    role,
    updatedAt: asIsoString(record.updatedAt, new Date().toISOString())
  };
}

function coercePermission(entry: unknown): PermissionAssignment | null {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const id = asOptionalString(record.id);
  const projectId = asOptionalString(record.projectId);
  const userId = asOptionalString(record.userId);
  const feature = normalizePermissionFeature(record.feature);

  if (!id || !projectId || !userId || !feature) {
    return null;
  }

  const role = ACCESS_ROLE_SET.has(record.role as AccessRole) ? (record.role as AccessRole) : "viewer";

  return {
    id,
    projectId,
    feature,
    userId,
    role,
    updatedAt: asIsoString(record.updatedAt, new Date().toISOString())
  };
}

function coercePersonalTodo(entry: unknown): PersonalTodo | null {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const id = asOptionalString(record.id);
  const ownerId = asOptionalString(record.ownerId);
  const title = asOptionalString(record.title);
  const description = asString(record.description) ?? "";

  if (!id || !ownerId || !title) {
    return null;
  }

  const repeatColor = asOptionalString(record.repeatColor) ?? "#22c55e";

  return {
    id,
    ownerId,
    title,
    description,
    completed: asBoolean(record.completed, false),
    completedAt: asOptionalIsoString(record.completedAt),
    priority: normalizeTodoPriority(record.priority),
    recurrence: normalizeTodoRecurrence(record.recurrence),
    repeatColor,
    createdAt: asIsoString(record.createdAt, new Date().toISOString()),
    updatedAt: asIsoString(record.updatedAt, new Date().toISOString())
  };
}

function coerceTaskAttachment(entry: unknown): TaskAttachment | null {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const id = asOptionalString(record.id);
  const name = asOptionalString(record.name);
  const mimeType = asOptionalString(record.mimeType);
  const createdBy = asOptionalString(record.createdBy);
  const fileId = asOptionalString(record.fileId);
  const url = asOptionalString(record.url) ?? (fileId ? createFileDownloadUrl(fileId) : undefined);
  const dataUrl = asOptionalString(record.dataUrl);

  if (!id || !name || !mimeType || !createdBy) {
    return null;
  }

  if (!dataUrl && !fileId && !url) {
    return null;
  }

  const rawSize = asNumber(record.size, 0);
  const size = Math.max(0, Math.trunc(rawSize));
  const rawKind = asOptionalString(record.kind);
  const kind = TASK_ATTACHMENT_KIND_SET.has(rawKind as TaskAttachmentKind)
    ? (rawKind as TaskAttachmentKind)
    : mimeType.startsWith("image/")
      ? "image"
      : "document";

  return {
    id,
    name,
    mimeType,
    kind,
    size,
    fileId,
    url,
    dataUrl,
    createdAt: asIsoString(record.createdAt, new Date().toISOString()),
    createdBy
  };
}

function coerceTaskComment(entry: unknown, taskIdFallback?: string): TaskComment | null {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const id = asOptionalString(record.id);
  const authorId = asOptionalString(record.authorId);
  const authorName = asOptionalString(record.authorName);
  const message = asOptionalString(record.message);

  if (!id || !authorId || !authorName || !message) {
    return null;
  }
  const taskId = asOptionalString(record.taskId) ?? taskIdFallback;
  if (!taskId) {
    return null;
  }

  const attachments = sanitizeCollection(record.attachments, [], coerceTaskAttachment);

  return {
    id,
    taskId,
    authorId,
    authorName,
    message,
    createdAt: asIsoString(record.createdAt, new Date().toISOString()),
    attachments
  };
}

function coerceTask(entry: unknown): Task | null {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const id = asOptionalString(record.id);
  const projectId = asOptionalString(record.projectId);
  const title = asOptionalString(record.title);
  const description = asString(record.description) ?? "";
  const assigneeId = asOptionalString(record.assigneeId);
  const reporterId = asOptionalString(record.reporterId);
  const ownerId = asOptionalString(record.ownerId);
  const dueDate = asOptionalString(record.dueDate);

  if (!id || !projectId || !title || !assigneeId || !reporterId || !ownerId || !dueDate) {
    return null;
  }

  const status = TASK_STATUS_SET.has(record.status as TaskStatus) ? (record.status as TaskStatus) : "backlog";
  const priority = TASK_PRIORITY_SET.has(record.priority as TaskPriority) ? (record.priority as TaskPriority) : "medium";
  const visibility = record.visibility === "private" ? "private" : "shared";
  const rawOrder = record.order;
  const order = typeof rawOrder === "number" && Number.isFinite(rawOrder) ? Math.trunc(rawOrder) : undefined;

  return {
    id,
    projectId,
    title,
    description,
    status,
    priority,
    assigneeId,
    participantIds: asStringArray(record.participantIds),
    reporterId,
    ownerId,
    dueDate,
    startDate: asOptionalString(record.startDate),
    endDate: asOptionalString(record.endDate),
    parentTaskId: asOptionalString(record.parentTaskId),
    order,
    visibility,
    tags: asStringArray(record.tags),
    attachments: sanitizeCollection(record.attachments, [], coerceTaskAttachment),
    comments: sanitizeCollection(record.comments, [], (comment) => coerceTaskComment(comment, id)),
    updatedAt: asIsoString(record.updatedAt, new Date().toISOString())
  };
}

function coerceKanbanHistoryItem(entry: unknown): SharedWorkspaceState["kanbanHistory"][number] | null {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const id = asOptionalString(record.id);
  const projectId = asOptionalString(record.projectId);
  const finalizedBy = asOptionalString(record.finalizedBy);
  const task = coerceTask(record.task);

  if (!id || !projectId || !finalizedBy || !task) {
    return null;
  }

  return {
    id,
    projectId,
    task,
    finalizedAt: asIsoString(record.finalizedAt, new Date().toISOString()),
    finalizedBy
  };
}

function coerceWhiteboardSceneData(entry: unknown): WhiteboardSceneData {
  const record = asRecord(entry);
  if (!record) {
    return {
      elements: [],
      appState: null,
      files: null
    };
  }

  return {
    elements: Array.isArray(record.elements) ? record.elements : [],
    appState: asRecord(record.appState),
    files: asRecord(record.files)
  };
}

function coerceWhiteboardScene(entry: unknown): WhiteboardScene | null {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const id = asOptionalString(record.id);
  const projectId = asOptionalString(record.projectId);
  const updatedBy = asOptionalString(record.updatedBy);

  if (!id || !projectId || !updatedBy) {
    return null;
  }

  return {
    id,
    projectId,
    scene: coerceWhiteboardSceneData(record.scene),
    updatedAt: asIsoString(record.updatedAt, new Date().toISOString()),
    updatedBy
  };
}

function coerceActivity(entry: unknown): Activity | null {
  const record = asRecord(entry);
  if (!record) {
    return null;
  }

  const id = asOptionalString(record.id);
  const actorId = asOptionalString(record.actorId);
  const type = normalizeActivityType(record.type);
  const message = asOptionalString(record.message);

  if (!id || !actorId || !type || !message) {
    return null;
  }

  return {
    id,
    actorId,
    type,
    message,
    createdAt: asIsoString(record.createdAt, new Date().toISOString())
  };
}

function coerceWorkspacePreferences(value: unknown): Record<string, AccountWorkspacePreference> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  const next: Record<string, AccountWorkspacePreference> = {};

  for (const [accountId, rawPreference] of Object.entries(record)) {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      continue;
    }

    const preference = asRecord(rawPreference);
    next[normalizedAccountId] = {
      language: normalizeWorkspaceLanguage(preference?.language),
      style: normalizeWorkspaceStyle(preference?.style)
    };
  }

  return next;
}

function coerceRecentProjectMap(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  const next: Record<string, string> = {};
  for (const [accountId, projectId] of Object.entries(record)) {
    const normalizedAccountId = accountId.trim();
    const normalizedProjectId = asOptionalString(projectId);

    if (!normalizedAccountId || !normalizedProjectId) {
      continue;
    }

    next[normalizedAccountId] = normalizedProjectId;
  }

  return next;
}

function dedupePermissions(permissions: PermissionAssignment[]) {
  const deduped: PermissionAssignment[] = [];
  const seen = new Set<string>();

  for (const permission of permissions) {
    const key = `${permission.projectId}:${permission.userId}:${permission.feature}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(permission);
  }

  return deduped;
}

export function sanitizeSharedWorkspaceState(input: unknown): SharedWorkspaceState {
  const fallback = createSeedSharedWorkspaceState();
  const record = asRecord(input);

  if (!record) {
    return fallback;
  }

  const incomingSeedRevision =
    typeof record.seedRevision === "number" && Number.isFinite(record.seedRevision)
      ? Math.trunc(record.seedRevision)
      : typeof record.seedRevision === "string" && record.seedRevision.trim().length > 0
        ? Math.trunc(Number.parseInt(record.seedRevision, 10))
        : null;

  if (incomingSeedRevision !== CURRENT_SEED_REVISION) {
    return fallback;
  }

  const users = sanitizeCollection(record.users, fallback.users, coerceUser);
  const projects = sanitizeCollection(record.projects, fallback.projects, coerceProject);
  const projectMemberships = sanitizeCollection(record.projectMemberships, fallback.projectMemberships, coerceProjectMembership);
  const permissions = dedupePermissions(sanitizeCollection(record.permissions, fallback.permissions, coercePermission));
  const personalTodos = sanitizeCollection(record.personalTodos, fallback.personalTodos, coercePersonalTodo);
  const tasks = sanitizeCollection(record.tasks, fallback.tasks, coerceTask);
  const kanbanTasks = sanitizeCollection(record.kanbanTasks, fallback.kanbanTasks, coerceTask);
  const kanbanHistory = sanitizeCollection(record.kanbanHistory, fallback.kanbanHistory, coerceKanbanHistoryItem);
  const whiteboardScenes = sanitizeCollection(record.whiteboardScenes, fallback.whiteboardScenes, coerceWhiteboardScene);
  const activities = sanitizeCollection(record.activities, fallback.activities, coerceActivity);

  const validUserIds = new Set(users.map((user) => user.id));
  const validProjectIds = new Set(projects.map((project) => project.id));

  const fallbackUserId = users[0]?.id ?? null;
  const filteredProjectMemberships = projectMemberships.filter(
    (membership) => validUserIds.has(membership.userId) && validProjectIds.has(membership.projectId)
  );
  const filteredPermissions = permissions.filter(
    (permission) => validUserIds.has(permission.userId) && validProjectIds.has(permission.projectId)
  );
  const filteredTodos = personalTodos.filter((todo) => validUserIds.has(todo.ownerId));
  const filteredTasks = tasks.filter((task) => validProjectIds.has(task.projectId));
  const filteredKanbanTasks = kanbanTasks.filter((task) => validProjectIds.has(task.projectId));
  const filteredKanbanHistory = kanbanHistory.filter((historyItem) => validProjectIds.has(historyItem.projectId));
  const filteredWhiteboardScenes = whiteboardScenes.filter((scene) => validProjectIds.has(scene.projectId));
  const filteredActivities = activities.map((activity) => {
    if (validUserIds.has(activity.actorId) || !fallbackUserId) {
      return activity;
    }

    return {
      ...activity,
      actorId: fallbackUserId
    };
  });

  const workspacePreferencesByAccountId = Object.fromEntries(
    Object.entries(coerceWorkspacePreferences(record.workspacePreferencesByAccountId)).filter(([accountId]) => validUserIds.has(accountId))
  );
  const recentProjectIdByAccountId = Object.fromEntries(
    Object.entries(coerceRecentProjectMap(record.recentProjectIdByAccountId)).filter(
      ([accountId, projectId]) => validUserIds.has(accountId) && validProjectIds.has(projectId)
    )
  );

  return {
    seedRevision: CURRENT_SEED_REVISION,
    users,
    projects,
    projectMemberships: filteredProjectMemberships,
    permissions: filteredPermissions,
    personalTodos: filteredTodos,
    tasks: filteredTasks,
    kanbanTasks: filteredKanbanTasks,
    kanbanHistory: filteredKanbanHistory,
    whiteboardScenes: filteredWhiteboardScenes,
    activities: filteredActivities,
    workspacePreferencesByAccountId,
    recentProjectIdByAccountId
  };
}

export function serializeSharedWorkspaceState(state: SharedWorkspaceState): string {
  return JSON.stringify(sanitizeSharedWorkspaceState(state));
}

export function deserializeSharedWorkspaceState(rawValue: unknown): SharedWorkspaceState {
  if (typeof rawValue === "string") {
    try {
      return sanitizeSharedWorkspaceState(JSON.parse(rawValue));
    } catch {
      return createSeedSharedWorkspaceState();
    }
  }

  return sanitizeSharedWorkspaceState(rawValue);
}

export function parseWorkspaceId(rawWorkspaceId: unknown): string | null {
  if (rawWorkspaceId === undefined || rawWorkspaceId === null) {
    return DEFAULT_WORKSPACE_ID;
  }

  if (typeof rawWorkspaceId !== "string") {
    return null;
  }

  const normalized = rawWorkspaceId.trim();
  if (normalized.length === 0) {
    return DEFAULT_WORKSPACE_ID;
  }

  return WORKSPACE_ID_PATTERN.test(normalized) ? normalized : null;
}
