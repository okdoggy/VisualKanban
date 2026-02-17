"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  seedActivities,
  seedComments,
  seedKanbanHistory,
  seedKanbanTasks,
  seedMindmapNodes,
  seedPermissions,
  seedProjects,
  seedTasks,
  seedUsers
} from "@/lib/data/seed";
import { canSeeTask, resolveRole } from "@/lib/permissions/roles";
import type {
  AccessRole,
  Activity,
  FeatureKey,
  KanbanHistoryItem,
  KanbanTaskPatch,
  KanbanTaskStatus,
  Task,
  TaskStatus,
  User,
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

export const useVisualKanbanStore = create<VisualKanbanState>()(
  persist(
    (set, get) => ({
      users: seedUsers,
      projects: seedProjects,
      permissions: seedPermissions,
      tasks: seedTasks,
      kanbanTasks: seedKanbanTasks,
      kanbanHistory: seedKanbanHistory,
      comments: seedComments,
      mindmapNodes: seedMindmapNodes,
      activities: seedActivities,
      currentUserId: null,
      connectedUserIds: [],
      sessionCheckedAt: null,

      login: (username, password) => {
        const user = get().users.find((candidate) => candidate.username === username.trim());
        if (!user) {
          return { ok: false, reason: "존재하지 않는 계정입니다." };
        }
        if (user.password !== password) {
          return { ok: false, reason: "비밀번호가 올바르지 않습니다." };
        }

        writeAuthCookie(user.id);
        set((state) => ({
          currentUserId: user.id,
          connectedUserIds: state.connectedUserIds.includes(user.id) ? state.connectedUserIds : [...state.connectedUserIds, user.id],
          sessionCheckedAt: nowIso(),
          activities: [makeActivity({ actorId: user.id, type: "login", message: `${user.username} 로그인 성공` }), ...state.activities].slice(
            0,
            200
          )
        }));

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
        if (nextPassword.trim().length < 8) {
          return { ok: false, reason: "비밀번호는 8자 이상이어야 합니다." };
        }

        set((state) => ({
          users: state.users.map((user) =>
            user.id === currentUserId
              ? {
                  ...user,
                  password: nextPassword,
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
        set((state) => ({
          projects: [
            {
              id: projectId,
              name,
              description: input.description.trim()
            },
            ...state.projects
          ]
        }));

        return { ok: true, projectId };
      },

      addTask: (input) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return;

        const tasks = get().tasks;
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
        const currentUserId = get().currentUserId;
        if (!currentUserId) return;

        const kanbanTasks = get().kanbanTasks;
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
        const currentUserId = get().currentUserId;
        if (!currentUserId) return;

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
        const currentUserId = get().currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const target = get().kanbanTasks.find((task) => task.id === taskId);
        if (!target) return { ok: false, reason: "태스크를 찾지 못했습니다." };

        set((state) => ({
          kanbanTasks: state.kanbanTasks.map((task) => (task.id === taskId ? applyKanbanStage(task, nextStatus) : task))
        }));

        return { ok: true };
      },

      finalizeKanbanTask: (taskId) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const target = get().kanbanTasks.find((task) => task.id === taskId);
        if (!target) {
          return { ok: false, reason: "태스크를 찾지 못했습니다." };
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
        const currentUserId = get().currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const target = get().kanbanHistory.find((item) => item.id === historyId);
        if (!target) {
          return { ok: false, reason: "보관된 태스크를 찾지 못했습니다." };
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
        const currentUserId = get().currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const target = get().tasks.find((task) => task.id === taskId);
        if (!target) return { ok: false, reason: "태스크를 찾지 못했습니다." };

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
        const currentUserId = get().currentUserId;
        if (!currentUserId) return;

        set((state) => ({
          tasks: state.tasks.map((task) => (task.id === taskId ? { ...task, ...patch, updatedAt: nowIso() } : task))
        }));
      },

      removeTask: (taskId) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) {
          return { ok: false, reason: "로그인이 필요합니다." };
        }

        const target = get().tasks.find((task) => task.id === taskId);
        if (!target) {
          return { ok: false, reason: "태스크를 찾지 못했습니다." };
        }

        const removedTaskIds = collectTaskAndDescendantIds(get().tasks, taskId);
        const removedTaskIdSet = new Set(removedTaskIds);

        set((state) => ({
          tasks: state.tasks.filter((task) => !removedTaskIdSet.has(task.id)),
          comments: state.comments.filter((comment) => !removedTaskIdSet.has(comment.taskId)),
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

      addComment: (taskId, body) => {
        const currentUserId = get().currentUserId;
        if (!currentUserId) return { ok: false, reason: "로그인이 필요합니다." };
        if (!body.trim()) return { ok: false, reason: "댓글 내용을 입력하세요." };

        const task = get().tasks.find((item) => item.id === taskId);
        if (!task) return { ok: false, reason: "태스크를 찾지 못했습니다." };

        set((state) => ({
          comments: [
            {
              id: uid("comment"),
              taskId,
              authorId: currentUserId,
              body,
              createdAt: nowIso()
            },
            ...state.comments
          ],
          activities: [makeActivity({ actorId: currentUserId, type: "comment_add", message: `${task.title}에 댓글 작성` }), ...state.activities].slice(
            0,
            200
          )
        }));

        return { ok: true };
      },

      setPermission: (projectId, feature, userId, role: AccessRole) => {
        const actor = get().currentUserId;
        if (!actor) return;

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
                actorId: actor,
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
        set((state) => ({
          sessionCheckedAt: nowIso(),
          connectedUserIds:
            currentUserId && !state.connectedUserIds.includes(currentUserId)
              ? [...state.connectedUserIds, currentUserId]
              : state.connectedUserIds
        }));
      }
    }),
    {
      name: "visual-kanban-state",
      storage: persistStorage,
      partialize: (state) => ({
        users: state.users,
        projects: state.projects,
        permissions: state.permissions,
        tasks: state.tasks,
        kanbanTasks: state.kanbanTasks,
        kanbanHistory: state.kanbanHistory,
        comments: state.comments,
        mindmapNodes: state.mindmapNodes,
        activities: state.activities,
        currentUserId: state.currentUserId,
        connectedUserIds: state.connectedUserIds,
        sessionCheckedAt: state.sessionCheckedAt
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
  permissions
}: {
  user: User | null;
  projectId: string;
  feature: FeatureKey;
  permissions: VisualKanbanState["permissions"];
}) {
  return resolveRole({ user, projectId, feature, assignments: permissions });
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
