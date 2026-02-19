import type {
  Activity,
  Comment,
  KanbanHistoryItem,
  MindmapNode,
  PermissionAssignment,
  PersonalTodo,
  ProjectMembership,
  Project,
  Task,
  User,
  WhiteboardScene
} from "@/lib/types";

const now = new Date().toISOString();
const nowDate = new Date();

function startOfWeek(date: Date) {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = normalized.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  normalized.setDate(normalized.getDate() + offset);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addWeeks(date: Date, weeks: number) {
  return addDays(date, weeks * 7);
}

const week0 = startOfWeek(nowDate);
const week1 = addWeeks(week0, 1);
const week2 = addWeeks(week0, 2);
const week3 = addWeeks(week0, 3);
const week4 = addWeeks(week0, 4);

export const seedUsers: User[] = [
  {
    id: "u-admin",
    username: "admin",
    displayName: "Admin Kim",
    icon: "K",
    password: "0000",
    mustChangePassword: true,
    baseRole: "admin"
  }
];

export const seedProjects: Project[] = [
  {
    id: "proj-visual",
    name: "VisualKanban",
    description: "Developer collaboration project board",
    ownerId: "u-admin"
  }
];

export const seedProjectMemberships: ProjectMembership[] = [
  {
    id: "member-proj-visual-owner",
    projectId: "proj-visual",
    userId: "u-admin",
    role: "owner",
    updatedAt: now
  }
];

export const seedPermissions: PermissionAssignment[] = [
  {
    id: "perm-1",
    projectId: "proj-visual",
    feature: "kanban",
    userId: "u-admin",
    role: "admin",
    updatedAt: now
  }
];

export const seedPersonalTodos: PersonalTodo[] = [
  {
    id: "todo-1",
    ownerId: "u-admin",
    title: "아침 스탠드업 준비",
    description: "어제/오늘/블로커 3줄로 정리",
    completed: false,
    completedAt: null,
    priority: 5,
    recurrence: { type: "daily" },
    repeatColor: "#0ea5e9",
    createdAt: addDays(week0, 1).toISOString(),
    updatedAt: addDays(week0, 1).toISOString()
  },
  {
    id: "todo-2",
    ownerId: "u-admin",
    title: "주간 회고 정리",
    description: "매주 금요일 배운 점 3개 기록",
    completed: false,
    completedAt: null,
    priority: 4,
    recurrence: { type: "weekly", weekdays: [5] },
    repeatColor: "#8b5cf6",
    createdAt: addDays(week0, 0).toISOString(),
    updatedAt: addDays(week0, 0).toISOString()
  },
  {
    id: "todo-3",
    ownerId: "u-admin",
    title: "개인 학습 일정 체크",
    description: "React 19 변경사항 요약 읽기",
    completed: true,
    completedAt: addDays(week1, 0).toISOString(),
    priority: 3,
    recurrence: { type: "none" },
    repeatColor: "#f59e0b",
    createdAt: addDays(week0, 2).toISOString(),
    updatedAt: addDays(week1, 0).toISOString()
  }
];

export const seedTasks: Task[] = [
  {
    id: "task-1",
    projectId: "proj-visual",
    title: "로그인 후 Dashboard 위젯 고도화",
    description: "첫 화면 정보 밀도 개선 및 액션 단축",
    status: "backlog",
    priority: "high",
    assigneeId: "u-admin",
    participantIds: ["u-admin"],
    reporterId: "u-admin",
    ownerId: "u-admin",
    dueDate: addDays(week2, 4).toISOString(),
    startDate: week1.toISOString(),
    endDate: addDays(week2, 4).toISOString(),
    order: 0,
    visibility: "shared",
    tags: ["dashboard", "ux", "color:#f59e0b"],
    updatedAt: now
  },
  {
    id: "task-2",
    projectId: "proj-visual",
    title: "Kanban 포스트잇 UX 적용",
    description: "세로형 보드 + 상태별 색상 + 빠른 이동 액션",
    status: "in_progress",
    priority: "high",
    assigneeId: "u-admin",
    participantIds: ["u-admin"],
    reporterId: "u-admin",
    ownerId: "u-admin",
    dueDate: addDays(week3, 2).toISOString(),
    startDate: week1.toISOString(),
    endDate: addDays(week3, 2).toISOString(),
    order: 1,
    visibility: "shared",
    tags: ["kanban", "interaction", "color:#0ea5e9"],
    updatedAt: now
  },
  {
    id: "task-3",
    projectId: "proj-visual",
    title: "Private 권한 검증 자동화",
    description: "Private 역할 사용자의 비공개 데이터 보호 테스트",
    status: "done",
    priority: "medium",
    assigneeId: "u-admin",
    participantIds: ["u-admin"],
    reporterId: "u-admin",
    ownerId: "u-admin",
    dueDate: addDays(week1, 4).toISOString(),
    startDate: week0.toISOString(),
    endDate: addDays(week1, 4).toISOString(),
    order: 2,
    visibility: "private",
    tags: ["permission", "security", "color:#10b981"],
    updatedAt: now
  },
  {
    id: "task-4",
    projectId: "proj-visual",
    title: "간트차트 주차 단위 개선",
    description: "Row/Column 기반 주차 그리드, Zoom, 오늘 주차 점프",
    status: "in_progress",
    priority: "medium",
    assigneeId: "u-admin",
    participantIds: ["u-admin"],
    reporterId: "u-admin",
    ownerId: "u-admin",
    dueDate: addDays(week4, 3).toISOString(),
    startDate: week2.toISOString(),
    endDate: addDays(week4, 3).toISOString(),
    order: 3,
    visibility: "shared",
    tags: ["gantt", "planning", "color:#8b5cf6"],
    updatedAt: now
  },
  {
    id: "task-5",
    projectId: "proj-visual",
    title: "간트 바 드래그/리사이즈 상호작용",
    description: "부모 간트 태스크 하위 작업 - 시작/종료일 직접 조정",
    status: "in_progress",
    priority: "high",
    assigneeId: "u-admin",
    participantIds: ["u-admin"],
    parentTaskId: "task-4",
    reporterId: "u-admin",
    ownerId: "u-admin",
    dueDate: addDays(week3, 5).toISOString(),
    startDate: addDays(week2, 1).toISOString(),
    endDate: addDays(week3, 5).toISOString(),
    order: 0,
    visibility: "shared",
    tags: ["gantt", "interaction", "color:#7c3aed"],
    updatedAt: now
  },
  {
    id: "task-6",
    projectId: "proj-visual",
    title: "간트 참여자/하위 태스크 표시",
    description: "부모-자식 구조와 다중 참여자 표시 UI 연결",
    status: "backlog",
    priority: "medium",
    assigneeId: "u-admin",
    participantIds: ["u-admin"],
    parentTaskId: "task-4",
    reporterId: "u-admin",
    ownerId: "u-admin",
    dueDate: addDays(week4, 1).toISOString(),
    startDate: addDays(week3, 0).toISOString(),
    endDate: addDays(week4, 1).toISOString(),
    order: 1,
    visibility: "shared",
    tags: ["gantt", "participants", "color:#6366f1"],
    updatedAt: now
  }
];

export const seedKanbanTasks: Task[] = seedTasks.map((task) => ({
  ...task,
  id: `kanban-${task.id}`,
  parentTaskId: task.parentTaskId ? `kanban-${task.parentTaskId}` : undefined,
  participantIds: task.participantIds ? [...task.participantIds] : undefined,
  tags: task.status === "backlog" ? ["kanban-stage:todo", ...task.tags] : [...task.tags]
}));

export const seedKanbanHistory: KanbanHistoryItem[] = [];

export const seedComments: Comment[] = [
  {
    id: "comment-1",
    taskId: "task-2",
    authorId: "u-admin",
    body: "Done 이동시 체크리스트 검증 모달을 넣어주세요.",
    createdAt: now
  }
];

export const seedMindmapNodes: MindmapNode[] = [
  {
    id: "node-root",
    projectId: "proj-visual",
    label: "VisualKanban",
    x: 250,
    y: 120
  },
  {
    id: "node-auth",
    projectId: "proj-visual",
    label: "Auth",
    parentId: "node-root",
    x: 100,
    y: 260
  },
  {
    id: "node-kanban",
    projectId: "proj-visual",
    label: "Kanban",
    parentId: "node-root",
    x: 400,
    y: 260,
    taskId: "task-2"
  }
];

export const seedWhiteboardScenes: WhiteboardScene[] = [
  {
    id: "whiteboard-proj-visual",
    projectId: "proj-visual",
    scene: {
      elements: [],
      appState: {
        viewBackgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0
      },
      files: null
    },
    updatedAt: now,
    updatedBy: "u-admin"
  }
];

export const seedActivities: Activity[] = [
  {
    id: "act-1",
    actorId: "u-admin",
    type: "permission_change",
    message: "Kanban 권한 정책 초기화",
    createdAt: now
  },
  {
    id: "act-2",
    actorId: "u-admin",
    type: "task_move",
    message: "Kanban 이동 UX 최적화 태스크를 In Progress로 변경",
    createdAt: now
  }
];
