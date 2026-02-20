import type {
  Activity,
  KanbanHistoryItem,
  PermissionAssignment,
  PersonalTodo,
  ProjectMembership,
  Project,
  Task,
  User,
  WhiteboardScene
} from "@/lib/types";

// Bump when we need to invalidate legacy seeded/persisted data for a clean rollout.
export const SEED_DATA_REVISION = 20260221;

export const seedUsers: User[] = [
  {
    id: "u-admin",
    username: "admin",
    displayName: "Admin",
    icon: "A",
    password: "0000",
    mustChangePassword: true,
    baseRole: "admin"
  }
];

export const seedProjects: Project[] = [
  {
    id: "proj-vg-cloud",
    name: "VG_Cloud",
    description: "Default workspace project",
    ownerId: "u-admin"
  }
];

export const seedProjectMemberships: ProjectMembership[] = [
  {
    id: "member-proj-vg-cloud-owner",
    projectId: "proj-vg-cloud",
    userId: "u-admin",
    role: "owner",
    updatedAt: new Date().toISOString()
  }
];

export const seedPermissions: PermissionAssignment[] = [];

export const seedPersonalTodos: PersonalTodo[] = [];

export const seedTasks: Task[] = [];

export const seedKanbanTasks: Task[] = [];

export const seedKanbanHistory: KanbanHistoryItem[] = [];

export const seedWhiteboardScenes: WhiteboardScene[] = [];

export const seedActivities: Activity[] = [];
