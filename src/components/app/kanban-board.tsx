"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
  useDroppable,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import { useShallow } from "zustand/react/shallow";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckSquare2, GripVertical, Lock, Play, RotateCcw, Square, CheckCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { canRead, canWrite } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, getVisibleTasks, useVisualKanbanStore } from "@/lib/store";
import type { Task, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

const COLUMNS: Array<{ id: TaskStatus; title: string; tone: "neutral" | "info" | "success" }> = [
  { id: "backlog", title: "Backlog", tone: "neutral" },
  { id: "in_progress", title: "In Progress", tone: "info" },
  { id: "done", title: "Done", tone: "success" }
];

const KEY_TO_STATUS: Record<string, TaskStatus> = {
  b: "backlog",
  i: "in_progress",
  d: "done"
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  done: "Done"
};

type UndoEntry = {
  previous: Record<string, TaskStatus>;
  timeoutId: ReturnType<typeof setTimeout>;
};

type MoveRecord = {
  taskId: string;
  from: TaskStatus;
  to: TaskStatus;
};

function isTaskStatus(value: string): value is TaskStatus {
  return value === "backlog" || value === "in_progress" || value === "done";
}

function getQuickAction(status: TaskStatus) {
  if (status === "backlog") {
    return { label: "Start", nextStatus: "in_progress" as TaskStatus, icon: Play };
  }
  if (status === "in_progress") {
    return { label: "Done", nextStatus: "done" as TaskStatus, icon: CheckCheck };
  }
  return { label: "Reopen", nextStatus: "backlog" as TaskStatus, icon: RotateCcw };
}

function postItTone(status: TaskStatus) {
  if (status === "backlog") {
    return "border-amber-300 bg-gradient-to-br from-amber-100 to-amber-50 dark:border-amber-700 dark:from-amber-900/55 dark:to-amber-950/35";
  }
  if (status === "in_progress") {
    return "border-sky-300 bg-gradient-to-br from-sky-100 to-sky-50 dark:border-sky-700 dark:from-sky-900/55 dark:to-sky-950/35";
  }
  return "border-emerald-300 bg-gradient-to-br from-emerald-100 to-emerald-50 dark:border-emerald-700 dark:from-emerald-900/55 dark:to-emerald-950/35";
}

export function KanbanBoard({ projectId }: { projectId: string }) {
  const { projects, tasks, users, permissions, currentUserId, moveTask } = useVisualKanbanStore(useShallow((state) => ({
    projects: state.projects,
    tasks: state.tasks,
    users: state.users,
    permissions: state.permissions,
    currentUserId: state.currentUserId,
    moveTask: state.moveTask
  })));

  const project = useMemo(() => projects.find((item) => item.id === projectId) ?? null, [projects, projectId]);
  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);

  const role = useMemo(
    () =>
      getEffectiveRoleForFeature({
        user: currentUser,
        projectId,
        feature: "kanban",
        permissions
      }),
    [currentUser, permissions, projectId]
  );

  const readable = canRead(role);
  const writable = canWrite(role);

  const projectTasks = useMemo(() => tasks.filter((task) => task.projectId === projectId), [tasks, projectId]);

  const visibleTasks = useMemo(
    () =>
      getVisibleTasks({
        tasks: projectTasks,
        user: currentUser,
        role
      }),
    [projectTasks, currentUser, role]
  );

  const taskMap = useMemo(() => new Map(visibleTasks.map((task) => [task.id, task])), [visibleTasks]);

  const tasksByStatus = useMemo(() => {
    const sorted = [...visibleTasks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return {
      backlog: sorted.filter((task) => task.status === "backlog"),
      in_progress: sorted.filter((task) => task.status === "in_progress"),
      done: sorted.filter((task) => task.status === "done")
    } as Record<TaskStatus, Task[]>;
  }, [visibleTasks]);

  const userDisplayById = useMemo(() => {
    return users.reduce<Record<string, string>>((acc, user) => {
      acc[user.id] = user.displayName;
      return acc;
    }, {});
  }, [users]);

  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const undoRef = useRef<Map<string, UndoEntry>>(new Map());

  const selectedIds = useMemo(() => Array.from(selectedTaskIds).filter((id) => taskMap.has(id)), [selectedTaskIds, taskMap]);
  const effectiveFocusedTaskId = focusedTaskId && taskMap.has(focusedTaskId) ? focusedTaskId : null;

  useEffect(() => {
    const undoEntries = undoRef.current;
    return () => {
      undoEntries.forEach((entry) => clearTimeout(entry.timeoutId));
      undoEntries.clear();
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const applyMoves = useCallback(
    (taskIds: string[], nextStatus: TaskStatus, source: "drag" | "quick" | "bulk" | "keyboard") => {
      if (!writable) {
        toast.warning("Viewer role is read-only. You can review tasks but cannot move them.");
        return;
      }

      const uniqueIds = Array.from(new Set(taskIds));
      const plannedMoves = uniqueIds
        .map((taskId) => {
          const task = taskMap.get(taskId);
          if (!task || task.status === nextStatus) return null;
          return {
            taskId,
            from: task.status,
            to: nextStatus
          } as MoveRecord;
        })
        .filter((item): item is MoveRecord => item !== null);

      if (plannedMoves.length === 0) {
        return;
      }

      const successful: MoveRecord[] = [];
      const failures: string[] = [];

      plannedMoves.forEach((move) => {
        const result = moveTask(move.taskId, move.to);
        if (result.ok) {
          successful.push(move);
        } else {
          failures.push(result.reason ?? move.taskId);
        }
      });

      if (successful.length > 0) {
        const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const previous: Record<string, TaskStatus> = {};
        successful.forEach((move) => {
          previous[move.taskId] = move.from;
        });

        const timeoutId = setTimeout(() => {
          undoRef.current.delete(token);
        }, 6000);

        undoRef.current.set(token, { previous, timeoutId });

        toast.success(
          `${successful.length} task${successful.length > 1 ? "s" : ""} moved to ${STATUS_LABEL[nextStatus]}.`,
          {
            duration: 6000,
            action: {
              label: "Undo",
              onClick: () => {
                const entry = undoRef.current.get(token);
                if (!entry) return;

                clearTimeout(entry.timeoutId);
                undoRef.current.delete(token);

                const undoErrors: string[] = [];
                Object.entries(entry.previous).forEach(([taskId, previousStatus]) => {
                  const result = moveTask(taskId, previousStatus);
                  if (!result.ok) {
                    undoErrors.push(result.reason ?? taskId);
                  }
                });

                if (undoErrors.length > 0) {
                  toast.error(`Undo failed for ${undoErrors.length} task(s).`);
                  return;
                }

                toast.message("Move undone.");
              }
            }
          }
        );
      }

      if (failures.length > 0) {
        toast.error(`Failed to move ${failures.length} task(s).`);
      }

      if (source === "quick") {
        setSelectedTaskIds(new Set());
      }
    },
    [moveTask, taskMap, writable]
  );

  const onToggleTaskSelection = useCallback((taskId: string) => {
    setSelectedTaskIds((previous) => {
      const next = new Set(previous);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const onSelectAll = useCallback(() => {
    setSelectedTaskIds(new Set(visibleTasks.map((task) => task.id)));
  }, [visibleTasks]);

  const onClearSelection = useCallback(() => {
    setSelectedTaskIds(new Set());
  }, []);

  const onDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      if (!writable) return;

      const { active, over } = event;
      if (!over) return;

      const activeId = String(active.id);
      const draggedTask = taskMap.get(activeId);
      if (!draggedTask) return;

      const overId = String(over.id);
      const destinationStatus: TaskStatus | undefined = isTaskStatus(overId) ? overId : taskMap.get(overId)?.status;

      if (!destinationStatus || destinationStatus === draggedTask.status) {
        return;
      }

      const dragSelection = selectedTaskIds.has(activeId) ? Array.from(selectedTaskIds) : [activeId];
      applyMoves(dragSelection, destinationStatus, "drag");
    },
    [applyMoves, selectedTaskIds, taskMap, writable]
  );

  const onBoardKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!writable) return;

      const target = event.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable) {
        return;
      }

      const nextStatus = KEY_TO_STATUS[event.key.toLowerCase()];
      if (!nextStatus) {
        return;
      }

      const targets = selectedIds.length > 0 ? selectedIds : effectiveFocusedTaskId ? [effectiveFocusedTaskId] : [];
      if (targets.length === 0) {
        return;
      }

      event.preventDefault();
      applyMoves(targets, nextStatus, "keyboard");
    },
    [applyMoves, effectiveFocusedTaskId, selectedIds, writable]
  );

  const activeTask = activeDragId ? taskMap.get(activeDragId) ?? null : null;

  if (!project) {
    return (
      <Card>
        <CardTitle>Project not found</CardTitle>
        <CardDescription className="mt-1">The project ID <code>{projectId}</code> does not exist.</CardDescription>
      </Card>
    );
  }

  if (!readable) {
    return (
      <FeatureAccessDenied
        feature="Kanban"
        message="현재 계정에는 Kanban 접근 권한이 없습니다. Private scope 설정 또는 관리자 권한을 확인하세요."
      />
    );
  }

  return (
    <section onKeyDown={onBoardKeyDown} className="space-y-4" aria-label="Kanban board">
      <PageHeader
        title={`${project.name} Kanban`}
        description="Drag & drop, quick actions, multi-select bulk controls, and keyboard shortcuts (I / D / B)."
        role={role}
        actions={
          <div className="flex items-center gap-2">
            {role === "private" ? <Badge variant="warning">Private scope</Badge> : null}
            <Badge variant={writable ? "success" : "warning"}>{writable ? "Editable" : "Read-only"}</Badge>
          </div>
        }
      />

      {!writable ? (
        <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 text-amber-600" />
            <div>
              <CardTitle className="text-amber-900 dark:text-amber-100">Viewer mode (read-only)</CardTitle>
              <CardDescription className="mt-1 text-amber-700 dark:text-amber-300">
                You can inspect cards, but only Editor/Admin/Private roles can move tasks.
              </CardDescription>
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">{selectedIds.length} selected</Badge>
          <Button variant="outline" size="sm" onClick={onSelectAll} disabled={visibleTasks.length === 0}>
            Select all
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearSelection} disabled={selectedIds.length === 0}>
            Clear
          </Button>

          <div className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />

          <Button size="sm" variant="secondary" onClick={() => applyMoves(selectedIds, "backlog", "bulk")} disabled={!writable || selectedIds.length === 0}>
            Backlog (B)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => applyMoves(selectedIds, "in_progress", "bulk")}
            disabled={!writable || selectedIds.length === 0}
          >
            In Progress (I)
          </Button>
          <Button size="sm" variant="secondary" onClick={() => applyMoves(selectedIds, "done", "bulk")} disabled={!writable || selectedIds.length === 0}>
            Done (D)
          </Button>

          <p className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">Shortcuts: I / D / B (focused card or selected cards)</p>
        </div>
      </Card>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid gap-4 xl:grid-cols-3">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column.id}
              id={column.id}
              title={column.title}
              tone={column.tone}
              tasks={tasksByStatus[column.id]}
              writable={writable}
              selectedTaskIds={selectedTaskIds}
              focusedTaskId={effectiveFocusedTaskId}
              userDisplayById={userDisplayById}
              onToggleTaskSelection={onToggleTaskSelection}
              onFocusTask={setFocusedTaskId}
              onQuickAction={(taskId, nextStatus) => applyMoves([taskId], nextStatus, "quick")}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className={cn("w-[320px] rounded-lg border p-3 shadow-lg", postItTone(activeTask.status))}>
              <p className="text-sm font-semibold">{activeTask.title}</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{STATUS_LABEL[activeTask.status]}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

function KanbanColumn({
  id,
  title,
  tone,
  tasks,
  writable,
  selectedTaskIds,
  focusedTaskId,
  userDisplayById,
  onToggleTaskSelection,
  onFocusTask,
  onQuickAction
}: {
  id: TaskStatus;
  title: string;
  tone: "neutral" | "info" | "success";
  tasks: Task[];
  writable: boolean;
  selectedTaskIds: Set<string>;
  focusedTaskId: string | null;
  userDisplayById: Record<string, string>;
  onToggleTaskSelection: (taskId: string) => void;
  onFocusTask: (taskId: string) => void;
  onQuickAction: (taskId: string, nextStatus: TaskStatus) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    disabled: !writable
  });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/35",
        isOver && writable && "border-sky-400 bg-sky-50/70 dark:border-sky-700 dark:bg-sky-950/20"
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{title}</h2>
        <Badge variant={tone}>{tasks.length}</Badge>
      </div>

      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {tasks.map((task) => (
            <KanbanTaskCard
              key={task.id}
              task={task}
              writable={writable}
              selected={selectedTaskIds.has(task.id)}
              focused={focusedTaskId === task.id}
              assignee={userDisplayById[task.assigneeId] ?? task.assigneeId}
              onToggleSelect={onToggleTaskSelection}
              onFocus={onFocusTask}
              onQuickAction={onQuickAction}
            />
          ))}
          {tasks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Drop tasks here
            </div>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}

function KanbanTaskCard({
  task,
  writable,
  selected,
  focused,
  assignee,
  onToggleSelect,
  onFocus,
  onQuickAction
}: {
  task: Task;
  writable: boolean;
  selected: boolean;
  focused: boolean;
  assignee: string;
  onToggleSelect: (taskId: string) => void;
  onFocus: (taskId: string) => void;
  onQuickAction: (taskId: string, nextStatus: TaskStatus) => void;
}) {
  const { attributes, listeners, isDragging, setNodeRef, transform, transition } = useSortable({
    id: task.id,
    disabled: !writable
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const quickAction = getQuickAction(task.status);
  const QuickActionIcon = quickAction.icon;

  return (
    <article
      ref={setNodeRef}
      style={style}
      tabIndex={0}
      onFocus={() => onFocus(task.id)}
      className={cn(
        "relative rounded-lg border p-3 shadow-sm outline-none transition",
        postItTone(task.status),
        selected && "border-sky-400 ring-2 ring-sky-300/70 dark:border-sky-700 dark:ring-sky-800/80",
        focused && "ring-2 ring-zinc-300 dark:ring-zinc-600",
        isDragging && "opacity-55"
      )}
    >
      <span className="absolute left-1/2 top-1 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-zinc-500/35 dark:bg-zinc-200/35" />
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 rounded text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          onClick={() => onToggleSelect(task.id)}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={selected ? "Deselect task" : "Select task"}
        >
          {selected ? <CheckSquare2 className="h-4 w-4" /> : <Square className="h-4 w-4" />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{task.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{task.description}</p>
        </div>

        <button
          type="button"
          className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          aria-label="Drag task"
          {...attributes}
          {...listeners}
          disabled={!writable}
          onPointerDown={(event) => {
            if (!writable) {
              event.preventDefault();
            }
          }}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant={task.priority === "high" ? "warning" : task.priority === "medium" ? "info" : "neutral"}>{task.priority}</Badge>
        <Badge variant={task.visibility === "private" ? "warning" : "neutral"}>{task.visibility}</Badge>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Assignee: {assignee}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={!writable}
          onClick={() => onQuickAction(task.id, quickAction.nextStatus)}
          className="h-8"
        >
          <QuickActionIcon className="h-3.5 w-3.5" />
          {quickAction.label}
        </Button>
        <span className="text-[11px] text-zinc-400">I / D / B</span>
      </div>
    </article>
  );
}
