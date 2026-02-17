export type BaseRole = "admin" | "editor" | "viewer";
export type AccessRole = BaseRole | "private";

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

export type AddTaskInput = Pick<Task, "projectId" | "title" | "description" | "priority" | "assigneeId" | "dueDate" | "visibility"> &
  Partial<Pick<Task, "participantIds" | "parentTaskId" | "order" | "startDate" | "endDate">>;

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
  permissions: PermissionAssignment[];
  tasks: Task[];
  comments: Comment[];
  mindmapNodes: MindmapNode[];
  activities: Activity[];
  currentUserId: string | null;
  connectedUserIds: string[];
  sessionCheckedAt: string | null;

  login: (username: string, password: string) => { ok: boolean; reason?: string };
  logout: () => void;
  changePassword: (nextPassword: string) => { ok: boolean; reason?: string };
  updateMyIcon: (nextIcon: string) => { ok: boolean; reason?: string };
  addProject: (input: Pick<Project, "name" | "description">) => { ok: boolean; reason?: string; projectId?: string };

  addTask: (input: AddTaskInput) => void;
  moveTask: (taskId: string, nextStatus: TaskStatus) => { ok: boolean; reason?: string };
  updateTask: (taskId: string, patch: Partial<Task>) => void;
  removeTask: (taskId: string) => { ok: boolean; reason?: string; removedTaskIds?: string[] };
  addComment: (taskId: string, body: string) => { ok: boolean; reason?: string };

  setPermission: (projectId: string, feature: FeatureKey, userId: string, role: AccessRole) => void;
  ensureSessionCheck: () => void;
}
