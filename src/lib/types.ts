export type BaseRole = "admin" | "editor" | "viewer";
export type AccessRole = BaseRole | "private";
export type ProjectMemberRole = "owner" | "write" | "read";

export type FeatureKey =
  | "project"
  | "kanban"
  | "mindmap"
  | "gantt"
  | "taskboard"
  | "todo"
  | "search"
  | "comments";

export type TaskStatus = "backlog" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type TodoPriority = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type TodoRecurrenceType = "none" | "daily" | "weekly";
export type TodoWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type WorkspaceLanguage = "ko" | "en";
export type WorkspaceStylePreset = "neo-classic" | "neo-vivid" | "modern-light" | "modern-dark" | "warm-brown";
export type WorkspaceStyle = WorkspaceStylePreset;

export interface AccountWorkspacePreference {
  language: WorkspaceLanguage;
  style: WorkspaceStyle;
}

export type TodoRecurrence =
  | { type: "none" }
  | { type: "daily" }
  | { type: "weekly"; weekdays: TodoWeekday[] };

export interface User {
  id: string;
  username: string;
  displayName: string;
  icon?: string;
  password: string;
  mustChangePassword: boolean;
  baseRole: BaseRole;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
}

export interface ProjectMembership {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  updatedAt: string;
}

export interface PermissionAssignment {
  id: string;
  projectId: string;
  feature: FeatureKey;
  userId: string;
  role: AccessRole;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string;
  participantIds?: string[];
  reporterId: string;
  ownerId: string;
  dueDate: string;
  startDate?: string;
  endDate?: string;
  parentTaskId?: string;
  order?: number;
  visibility: "shared" | "private";
  tags: string[];
  updatedAt: string;
}

export interface PersonalTodo {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  completed: boolean;
  completedAt: string | null;
  priority: TodoPriority;
  recurrence: TodoRecurrence;
  repeatColor: string;
  createdAt: string;
  updatedAt: string;
}

export type AddTodoInput = Pick<PersonalTodo, "title"> &
  Partial<Pick<PersonalTodo, "description" | "priority" | "recurrence" | "repeatColor">>;

export type UpdateTodoInput = Partial<Pick<PersonalTodo, "title" | "description" | "priority" | "recurrence" | "repeatColor" | "completed">>;

export type KanbanTaskStatus = TaskStatus | "todo";

export interface KanbanHistoryItem {
  id: string;
  projectId: string;
  task: Task;
  finalizedAt: string;
  finalizedBy: string;
}

export type KanbanTaskPatch = Partial<Omit<Task, "status">> & {
  status?: KanbanTaskStatus;
};

export type AddTaskInput = Pick<Task, "projectId" | "title" | "description" | "priority" | "assigneeId" | "dueDate" | "visibility"> &
  Partial<Pick<Task, "participantIds" | "parentTaskId" | "order" | "startDate" | "endDate">> & {
    status?: KanbanTaskStatus;
    tags?: Task["tags"];
    ownerId?: Task["ownerId"];
  };

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface MindmapNode {
  id: string;
  projectId: string;
  label: string;
  parentId?: string;
  taskId?: string;
  x: number;
  y: number;
}

export interface WhiteboardSceneData {
  elements: unknown[];
  appState: Record<string, unknown> | null;
  files: Record<string, unknown> | null;
}

export interface WhiteboardScene {
  id: string;
  projectId: string;
  scene: WhiteboardSceneData;
  updatedAt: string;
  updatedBy: string;
}

export interface Activity {
  id: string;
  actorId: string;
  type: "login" | "task_move" | "comment_add" | "permission_change" | "task_create";
  message: string;
  createdAt: string;
}

export interface VisualKanbanState {
  users: User[];
  projects: Project[];
  projectMemberships: ProjectMembership[];
  permissions: PermissionAssignment[];
  personalTodos: PersonalTodo[];
  tasks: Task[];
  kanbanTasks: Task[];
  kanbanHistory: KanbanHistoryItem[];
  comments: Comment[];
  mindmapNodes: MindmapNode[];
  whiteboardScenes: WhiteboardScene[];
  activities: Activity[];
  currentUserId: string | null;
  connectedUserIds: string[];
  sessionCheckedAt: string | null;
  workspaceLanguage: WorkspaceLanguage;
  workspaceStyle: WorkspaceStyle;
  workspacePreferencesByAccountId: Record<string, AccountWorkspacePreference>;
  recentProjectIdByAccountId: Record<string, string>;

  login: (username: string, password: string) => { ok: boolean; reason?: string };
  logout: () => void;
  changePassword: (nextPassword: string) => { ok: boolean; reason?: string };
  updateMyIcon: (nextIcon: string) => { ok: boolean; reason?: string };
  createUser: (input: {
    username: string;
    displayName: string;
    password: string;
    baseRole?: BaseRole;
  }) => { ok: boolean; reason?: string; userId?: string };
  addProject: (input: Pick<Project, "name" | "description">) => { ok: boolean; reason?: string; projectId?: string };
  updateProject: (projectId: string, input: Partial<Pick<Project, "name" | "description">>) => { ok: boolean; reason?: string };
  setProjectMemberRole: (projectId: string, userId: string, role: ProjectMemberRole) => { ok: boolean; reason?: string };
  deleteProject: (projectId: string) => { ok: boolean; reason?: string };

  addTodo: (input: AddTodoInput) => { ok: boolean; reason?: string; todoId?: string };
  updateTodo: (todoId: string, patch: UpdateTodoInput) => { ok: boolean; reason?: string };
  toggleTodo: (todoId: string, forceCompleted?: boolean) => { ok: boolean; reason?: string };
  removeTodo: (todoId: string) => { ok: boolean; reason?: string };
  cleanupTodos: () => { removed: number; reactivated: number };
  saveWhiteboardScene: (projectId: string, scene: WhiteboardSceneData) => { ok: boolean; reason?: string };

  addTask: (input: AddTaskInput) => void;
  addKanbanTask: (input: AddTaskInput) => void;
  updateKanbanTask: (taskId: string, patch: KanbanTaskPatch) => void;
  moveKanbanTask: (taskId: string, nextStatus: KanbanTaskStatus) => { ok: boolean; reason?: string };
  finalizeKanbanTask: (taskId: string) => { ok: boolean; reason?: string };
  restoreKanbanTask: (historyId: string) => { ok: boolean; reason?: string };
  moveTask: (taskId: string, nextStatus: TaskStatus) => { ok: boolean; reason?: string };
  updateTask: (taskId: string, patch: Partial<Task>) => void;
  removeTask: (taskId: string) => { ok: boolean; reason?: string; removedTaskIds?: string[] };
  addComment: (taskId: string, body: string) => { ok: boolean; reason?: string };

  setPermission: (projectId: string, feature: FeatureKey, userId: string, role: AccessRole) => void;
  ensureSessionCheck: () => void;
  setWorkspaceLanguage: (nextLanguage: WorkspaceLanguage) => void;
  setWorkspaceStyle: (nextStyle: WorkspaceStyle) => void;
  setRecentProjectForCurrentAccount: (projectId: string) => void;
}
