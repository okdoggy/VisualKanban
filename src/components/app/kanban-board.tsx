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
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CheckCheck,
  Check,
  CheckSquare2,
  CirclePlus,
  MessageSquare,
  Pencil,
  Paperclip,
  FolderKanban,
  GripVertical,
  Play,
  RotateCcw,
  Send,
  Square,
  Trash2,
  UserCheck,
  Users,
  X
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState
} from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UserAutocompleteMultiSelect, UserAutocompleteSelect } from "@/components/ui/user-autocomplete";
import { canRead, canWrite } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, getVisibleTasks, useVisualKanbanStore } from "@/lib/store";
import type { KanbanHistoryItem, Task, TaskAttachment, TaskComment, TaskStatus, User } from "@/lib/types";
import { cn } from "@/lib/utils/cn";

type KanbanStage = TaskStatus | "todo";

type AssignmentViewMode = "all" | "assignee" | "assignee_or_participant";
type SortMode = "updated" | "priority_asc" | "priority_desc" | "due_soon";
type MoveSource = "drag" | "quick";

type MutationResult = {
  ok: boolean;
  reason?: string;
};

type AddMutationResult = MutationResult & {
  taskId?: string;
};

type TaskEditorDraft = {
  title: string;
  description: string;
  stage: KanbanStage;
  priority: number;
  assigneeId: string;
  ownerId: string;
  participantIds: string[];
  dueDate: string;
  visibility: "shared" | "private";
  attachments: TaskAttachment[];
  comments: TaskComment[];
};

type CommentComposerDraft = {
  message: string;
  attachments: TaskAttachment[];
};

type NormalizedHistoryEntry = {
  historyId: string;
  projectId: string;
  task: Task;
  finalizedAt: string;
};

type KanbanStoreExtension = {
  kanbanHistory?: Array<Task | KanbanHistoryItem>;
  addKanbanTask?: (input: Record<string, unknown>) => AddMutationResult | void;
  updateKanbanTask?: (taskId: string, patch: Record<string, unknown>) => MutationResult | void;
  removeKanbanTask?: (taskId: string) => MutationResult | void;
  finalizeKanbanTask?: (taskId: string) => MutationResult | void;
  restoreKanbanTask?: (taskId: string) => MutationResult | void;
};

const COLUMNS: Array<{ id: KanbanStage; title: string; tone: "neutral" | "info" | "warning" | "success" }> = [
  { id: "backlog", title: "Backlog", tone: "neutral" },
  { id: "todo", title: "To do", tone: "warning" },
  { id: "in_progress", title: "In Progress", tone: "info" },
  { id: "done", title: "Done", tone: "success" }
];

const STAGE_LABEL: Record<KanbanStage, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In Progress",
  done: "Done"
};

const STAGE_BADGE_VARIANT: Record<KanbanStage, "neutral" | "info" | "warning" | "success"> = {
  backlog: "neutral",
  todo: "warning",
  in_progress: "info",
  done: "success"
};

const SOURCE_LABEL: Record<MoveSource, string> = {
  drag: "drag",
  quick: "quick"
};

const assignmentModeMeta: Record<
  AssignmentViewMode,
  {
    label: string;
    shortLabel: string;
    icon: typeof FolderKanban | typeof UserCheck | typeof Users;
  }
> = {
  all: {
    label: "전체",
    shortLabel: "전체",
    icon: FolderKanban
  },
  assignee: {
    label: "담당",
    shortLabel: "담당",
    icon: UserCheck
  },
  assignee_or_participant: {
    label: "담당+참여",
    shortLabel: "담당+참여",
    icon: Users
  }
};

const assignmentModeOrder: AssignmentViewMode[] = ["all", "assignee", "assignee_or_participant"];

const sortModeMeta: Record<SortMode, { label: string; shortLabel: string }> = {
  updated: {
    label: "기본(최신업데이트순)",
    shortLabel: "기본"
  },
  priority_asc: {
    label: "우선순위순(1↑)",
    shortLabel: "우선순위↑"
  },
  priority_desc: {
    label: "우선순위역순(7↓)",
    shortLabel: "우선순위↓"
  },
  due_soon: {
    label: "마감임박순",
    shortLabel: "마감임박"
  }
};

const sortModeOrder: SortMode[] = ["updated", "priority_asc", "priority_desc", "due_soon"];

const KANBAN_STAGE_TAG_PREFIX = "kanban-stage:";
const KANBAN_PRIORITY_TAG_PREFIX = "kprio:";
const TOOLBAR_CONTROL_CLASS =
  "border-2 border-zinc-900 shadow-[2px_2px_0_0_rgb(24,24,27)] transition-[transform,box-shadow,background-color,border-color,color] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-none active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none dark:border-zinc-100 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]";
const CARD_INTERACTION_CLASS =
  "transition-[box-shadow,border-color,background-color,opacity] duration-150 ease-out motion-reduce:transition-none";
const NEO_CARD_CLASS =
  "rounded-2xl border-2 border-zinc-900 bg-white shadow-[4px_4px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[4px_4px_0_0_rgb(0,0,0)]";
const TASK_ATTACHMENT_ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.hwp,.hwpx";
const MAX_ATTACHMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_TASK_ATTACHMENTS = 30;
const MAX_COMMENT_ATTACHMENTS = 10;
const MAX_TASK_COMMENTS = 200;

function makeClientId(prefix: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  if (size >= 1024) return `${Math.round(size / 1024)}KB`;
  return `${size}B`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("파일을 읽지 못했습니다."));
    };
    reader.onerror = () => {
      reject(new Error("파일을 읽지 못했습니다."));
    };
    reader.readAsDataURL(file);
  });
}

function resolveAttachmentKind(mimeType: string): TaskAttachment["kind"] {
  return mimeType.startsWith("image/") ? "image" : "document";
}

function cloneTaskAttachment(attachment: TaskAttachment): TaskAttachment {
  const mimeType = attachment.mimeType || "application/octet-stream";
  return {
    ...attachment,
    mimeType,
    kind: attachment.kind ?? resolveAttachmentKind(mimeType),
    size: Number.isFinite(attachment.size) ? Math.max(0, Math.trunc(attachment.size)) : 0
  };
}

function normalizeTaskAttachments(attachments: TaskAttachment[] | undefined) {
  return (attachments ?? []).map(cloneTaskAttachment);
}

function cloneTaskComment(comment: TaskComment): TaskComment {
  return {
    ...comment,
    attachments: comment.attachments.map(cloneTaskAttachment)
  };
}

function normalizeTaskComments(comments: TaskComment[] | undefined, taskIdFallback?: string) {
  return (comments ?? []).map((comment) => ({
    ...cloneTaskComment(comment),
    taskId: comment.taskId || taskIdFallback || "unknown-task"
  }));
}

function isTaskStatus(value: string): value is TaskStatus {
  return value === "backlog" || value === "in_progress" || value === "done";
}

function isKanbanStage(value: string): value is KanbanStage {
  return value === "todo" || isTaskStatus(value);
}

function sanitizePriority(value: number) {
  return Math.min(7, Math.max(1, Math.trunc(value)));
}

function normalizeResult(result: unknown): MutationResult {
  if (typeof result === "object" && result !== null && "ok" in result) {
    const casted = result as { ok?: unknown; reason?: unknown };
    return {
      ok: Boolean(casted.ok),
      reason: typeof casted.reason === "string" ? casted.reason : undefined
    };
  }
  return { ok: true };
}

function normalizeAddResult(result: unknown): AddMutationResult {
  const normalized = normalizeResult(result);
  if (typeof result === "object" && result !== null && "taskId" in result) {
    const taskId = (result as { taskId?: unknown }).taskId;
    return {
      ...normalized,
      taskId: typeof taskId === "string" ? taskId : undefined
    };
  }
  return normalized;
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0).map((tag) => tag.trim()))];
}

function readKanbanStage(task: Task): KanbanStage {
  const stageTag = normalizeTags(task.tags).find((tag) => tag.startsWith(KANBAN_STAGE_TAG_PREFIX));
  if (stageTag) {
    const raw = stageTag.slice(KANBAN_STAGE_TAG_PREFIX.length);
    if (isKanbanStage(raw)) {
      return raw;
    }
  }

  const rawStatus = String((task as { status?: unknown }).status ?? "");
  if (isKanbanStage(rawStatus)) {
    return rawStatus;
  }

  return "backlog";
}

function setKanbanStageTag(tags: unknown, stage: KanbanStage) {
  const base = normalizeTags(tags).filter((tag) => !tag.startsWith(KANBAN_STAGE_TAG_PREFIX));
  if (stage === "todo") {
    base.push(`${KANBAN_STAGE_TAG_PREFIX}todo`);
  }
  return base;
}

function readKanbanPriority(task: Task): number {
  const priorityTag = normalizeTags(task.tags).find((tag) => tag.startsWith(KANBAN_PRIORITY_TAG_PREFIX));
  if (priorityTag) {
    const parsed = Number(priorityTag.slice(KANBAN_PRIORITY_TAG_PREFIX.length));
    if (Number.isFinite(parsed)) {
      return sanitizePriority(parsed);
    }
  }

  const rawPriority = (task as { priority?: unknown }).priority;
  if (typeof rawPriority === "number" && Number.isFinite(rawPriority)) {
    return sanitizePriority(rawPriority);
  }

  if (typeof rawPriority === "string") {
    const parsed = Number(rawPriority);
    if (Number.isFinite(parsed)) {
      return sanitizePriority(parsed);
    }
    if (rawPriority === "high") return 1;
    if (rawPriority === "medium") return 4;
    if (rawPriority === "low") return 7;
  }

  return 4;
}

function numberToLegacyPriority(priority: number): Task["priority"] {
  const normalized = sanitizePriority(priority);
  if (normalized <= 2) return "high";
  if (normalized <= 5) return "medium";
  return "low";
}

function setKanbanPriorityTag(tags: unknown, priority: number) {
  const base = normalizeTags(tags).filter((tag) => !tag.startsWith(KANBAN_PRIORITY_TAG_PREFIX));
  base.push(`${KANBAN_PRIORITY_TAG_PREFIX}${sanitizePriority(priority)}`);
  return base;
}

function buildKanbanTags(tags: unknown, stage: KanbanStage, priority: number) {
  return setKanbanPriorityTag(setKanbanStageTag(tags, stage), priority);
}

function readTaskParticipantIds(task: Task) {
  const raw = Array.isArray(task.participantIds) ? task.participantIds : [];
  const normalized = [...new Set(raw.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()))];

  if (task.assigneeId && !normalized.includes(task.assigneeId)) {
    normalized.unshift(task.assigneeId);
  }

  return normalized;
}

function ensureAssigneeInParticipants(participantIds: string[], assigneeId: string) {
  const deduped = [...new Set(participantIds.filter((id) => id.trim().length > 0))];
  if (assigneeId && !deduped.includes(assigneeId)) {
    deduped.unshift(assigneeId);
  }
  return deduped;
}

function formatDateTime(value: string | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR");
}

function formatDate(value: string | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("ko-KR");
}

function toDateInputValue(value: string | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function dateInputToIso(value: string) {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function dueTimestamp(task: Task) {
  if (!task.dueDate) return Number.POSITIVE_INFINITY;
  const parsed = new Date(task.dueDate).getTime();
  if (Number.isNaN(parsed)) return Number.POSITIVE_INFINITY;
  return parsed;
}

function historyTimestamp(value: string | undefined) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return 0;
  return parsed;
}

function normalizeHistoryEntry(item: Task | KanbanHistoryItem): NormalizedHistoryEntry | null {
  if (!item || typeof item !== "object") return null;

  if ("task" in item) {
    const task = item.task;
    if (!task) return null;
    return {
      historyId: item.id,
      projectId: item.projectId,
      task,
      finalizedAt: item.finalizedAt
    };
  }

  return {
    historyId: item.id,
    projectId: item.projectId,
    task: item,
    finalizedAt: item.updatedAt
  };
}

function compareTasks(a: Task, b: Task, sortMode: SortMode) {
  const updatedDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

  if (sortMode === "updated") {
    return updatedDiff;
  }

  if (sortMode === "priority_asc") {
    const diff = readKanbanPriority(a) - readKanbanPriority(b);
    return diff !== 0 ? diff : updatedDiff;
  }

  if (sortMode === "priority_desc") {
    const diff = readKanbanPriority(b) - readKanbanPriority(a);
    return diff !== 0 ? diff : updatedDiff;
  }

  const dueDiff = dueTimestamp(a) - dueTimestamp(b);
  return Number.isFinite(dueDiff) && dueDiff !== 0 ? dueDiff : updatedDiff;
}

function taskSurfaceTone(stage: KanbanStage) {
  if (stage === "backlog") {
    return "border-zinc-200/85 bg-zinc-50/72 dark:border-zinc-700 dark:bg-zinc-900/35";
  }
  if (stage === "todo") {
    return "border-amber-200/85 bg-amber-50/75 dark:border-amber-800/75 dark:bg-amber-950/25";
  }
  if (stage === "in_progress") {
    return "border-sky-200/85 bg-sky-50/72 dark:border-sky-800/75 dark:bg-sky-950/25";
  }
  return "border-emerald-200/85 bg-emerald-50/75 dark:border-emerald-800/75 dark:bg-emerald-950/25";
}

function taskAccentTone(stage: KanbanStage) {
  if (stage === "backlog") {
    return "bg-zinc-400/80 dark:bg-zinc-500/75";
  }
  if (stage === "todo") {
    return "bg-amber-500/80 dark:bg-amber-400/80";
  }
  if (stage === "in_progress") {
    return "bg-sky-500/80 dark:bg-sky-400/80";
  }
  return "bg-emerald-500/80 dark:bg-emerald-400/80";
}

function getQuickAction(stage: KanbanStage) {
  if (stage === "backlog") {
    return { label: "To do", nextStage: "todo" as KanbanStage, icon: Play };
  }
  if (stage === "todo") {
    return { label: "Start", nextStage: "in_progress" as KanbanStage, icon: Play };
  }
  if (stage === "in_progress") {
    return { label: "Done", nextStage: "done" as KanbanStage, icon: CheckCheck };
  }
  return { label: "Reopen", nextStage: "todo" as KanbanStage, icon: RotateCcw };
}

function quickActionButtonVariant(nextStage: KanbanStage): "default" | "secondary" {
  if (nextStage === "in_progress") {
    return "secondary";
  }
  return "default";
}

function quickActionButtonTone(nextStage: KanbanStage) {
  if (nextStage === "done") {
    return "!bg-lime-300 hover:!bg-lime-200 dark:!bg-lime-300 dark:!text-zinc-950 dark:hover:!bg-lime-200";
  }
  return "";
}

function defaultDueDateInput() {
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  return nextWeek.toISOString().slice(0, 10);
}

function createNewTaskDraft(projectId: string, currentUserId: string | null, users: User[]): TaskEditorDraft {
  const fallbackUserId = currentUserId ?? users[0]?.id ?? "";
  return {
    title: "",
    description: "",
    stage: "todo",
    priority: 4,
    assigneeId: fallbackUserId,
    ownerId: fallbackUserId,
    participantIds: fallbackUserId ? [fallbackUserId] : [],
    dueDate: defaultDueDateInput(),
    visibility: "shared",
    attachments: [],
    comments: []
  };
}

function createDetailDraft(task: Task): TaskEditorDraft {
  const stage = readKanbanStage(task);
  const assigneeId = task.assigneeId;
  const participantIds = ensureAssigneeInParticipants(readTaskParticipantIds(task), assigneeId);

  return {
    title: task.title,
    description: task.description,
    stage,
    priority: readKanbanPriority(task),
    assigneeId,
    ownerId: task.ownerId,
    participantIds,
    dueDate: toDateInputValue(task.dueDate),
    visibility: task.visibility,
    attachments: normalizeTaskAttachments(task.attachments),
    comments: normalizeTaskComments(task.comments, task.id)
  };
}

function PopupShell({
  open,
  onClose,
  title,
  description,
  editableTitle,
  widthClassName = "max-w-2xl",
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  editableTitle?: {
    value: string;
    onChange: (nextValue: string) => void;
    disabled?: boolean;
    placeholder?: string;
  };
  widthClassName?: string;
  children: ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();
  const titleId = useId();

  const backdropTransition = prefersReducedMotion ? { duration: 0 } : { duration: 0.16, ease: "easeOut" as const };
  const panelTransition = prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" as const };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1 }}
          transition={{ duration: 0 }}
        >
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
            onClick={onClose}
            aria-label={`${title} 닫기`}
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={backdropTransition}
          />

          <motion.div
            className={cn(`relative w-full ${NEO_CARD_CLASS}`, widthClassName)}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.985 }}
            transition={panelTransition}
          >
            <div className="flex items-start gap-2 border-b-2 border-zinc-900 px-4 py-3 dark:border-zinc-100">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className={cn("truncate text-base font-semibold", editableTitle ? "sr-only" : "")}>
                  {title}
                </h2>
                {editableTitle ? (
                  <Input
                    value={editableTitle.value}
                    onChange={(event) => editableTitle.onChange(event.target.value)}
                    placeholder={editableTitle.placeholder ?? "제목"}
                    disabled={editableTitle.disabled}
                    className="h-10 w-full min-w-[220px] border-zinc-900 bg-white text-base font-semibold dark:border-zinc-100 dark:bg-zinc-900"
                    aria-label="작업 제목"
                  />
                ) : null}
                {description ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p> : null}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={onClose}
                className={cn(TOOLBAR_CONTROL_CLASS, "shrink-0")}
                aria-label={`${title} 닫기`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="max-h-[78vh] overflow-auto p-4 [&_button]:border-2 [&_button]:border-zinc-900 [&_button]:shadow-[2px_2px_0_0_rgb(24,24,27)] [&_button]:transition [&_button:hover]:-translate-y-0.5 [&_button:hover]:shadow-none dark:[&_button]:border-zinc-100 dark:[&_button]:shadow-[2px_2px_0_0_rgb(0,0,0)] [&_input]:border-2 [&_input]:border-zinc-900 [&_input]:shadow-[2px_2px_0_0_rgb(24,24,27)] dark:[&_input]:border-zinc-100 dark:[&_input]:shadow-[2px_2px_0_0_rgb(0,0,0)] [&_select]:border-2 [&_select]:border-zinc-900 [&_select]:shadow-[2px_2px_0_0_rgb(24,24,27)] dark:[&_select]:border-zinc-100 dark:[&_select]:shadow-[2px_2px_0_0_rgb(0,0,0)] [&_textarea]:border-2 [&_textarea]:border-zinc-900 [&_textarea]:shadow-[2px_2px_0_0_rgb(24,24,27)] dark:[&_textarea]:border-zinc-100 dark:[&_textarea]:shadow-[2px_2px_0_0_rgb(0,0,0)]">
              {children}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function KanbanBoard({ projectId }: { projectId: string }) {
  const router = useRouter();

  const {
    projects,
    kanbanTasks,
    kanbanHistory,
    users,
    projectMemberships,
    permissions,
    currentUserId,
    moveKanbanTask,
    addProject,
    addTask,
    updateTask,
    addKanbanTask,
    updateKanbanTask,
    removeKanbanTask,
    finalizeKanbanTask,
    restoreKanbanTask
  } = useVisualKanbanStore(
    useShallow((state) => {
      const extended = state as typeof state & KanbanStoreExtension;
      return {
        projects: state.projects,
        kanbanTasks: state.kanbanTasks,
        kanbanHistory: extended.kanbanHistory ?? [],
        users: state.users,
        projectMemberships: state.projectMemberships,
        permissions: state.permissions,
        currentUserId: state.currentUserId,
        moveKanbanTask: state.moveKanbanTask,
        addProject: state.addProject,
        addTask: state.addTask,
        updateTask: state.updateTask,
        addKanbanTask: extended.addKanbanTask,
        updateKanbanTask: extended.updateKanbanTask,
        removeKanbanTask: extended.removeKanbanTask,
        finalizeKanbanTask: extended.finalizeKanbanTask,
        restoreKanbanTask: extended.restoreKanbanTask
      };
    })
  );

  const project = useMemo(() => projects.find((item) => item.id === projectId) ?? null, [projects, projectId]);
  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);

  const role = useMemo(
    () =>
      getEffectiveRoleForFeature({
        user: currentUser,
        projectId,
        feature: "kanban",
        permissions,
        projectMemberships,
        projects
      }),
    [currentUser, permissions, projectId, projectMemberships, projects]
  );

  const readable = canRead(role);
  const writable = canWrite(role);

  const projectTasks = useMemo(() => kanbanTasks.filter((task) => task.projectId === projectId), [projectId, kanbanTasks]);
  const normalizedHistoryEntries = useMemo(
    () => (kanbanHistory as Array<Task | KanbanHistoryItem>).map((item) => normalizeHistoryEntry(item)).filter((item): item is NormalizedHistoryEntry => item !== null),
    [kanbanHistory]
  );
  const projectHistoryEntries = useMemo(
    () => normalizedHistoryEntries.filter((entry) => entry.projectId === projectId),
    [normalizedHistoryEntries, projectId]
  );

  const permissionFilteredTasks = useMemo(
    () =>
      getVisibleTasks({
        tasks: projectTasks,
        user: currentUser,
        role
      }),
    [projectTasks, currentUser, role]
  );

  const permissionFilteredHistory = useMemo(
    () =>
      getVisibleTasks({
        tasks: projectHistoryEntries.map((entry) => entry.task),
        user: currentUser,
        role
      }),
    [projectHistoryEntries, currentUser, role]
  );

  const [assignmentViewMode, setAssignmentViewMode] = useState<AssignmentViewMode>("all");
  const [highlightMyAssignments, setHighlightMyAssignments] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const [projectPopupOpen, setProjectPopupOpen] = useState(false);
  const [addTaskPopupOpen, setAddTaskPopupOpen] = useState(false);
  const [historyPopupOpen, setHistoryPopupOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const [newProjectForm, setNewProjectForm] = useState({
    name: "",
    description: ""
  });

  const [newTaskDraft, setNewTaskDraft] = useState<TaskEditorDraft>(() => createNewTaskDraft(projectId, currentUserId, users));
  const [detailDraft, setDetailDraft] = useState<TaskEditorDraft | null>(null);
  const [detailAttachmentUploading, setDetailAttachmentUploading] = useState(false);
  const [commentDraft, setCommentDraft] = useState<CommentComposerDraft>({
    message: "",
    attachments: []
  });
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentMessage, setEditingCommentMessage] = useState("");
  const [commentActionPending, setCommentActionPending] = useState(false);

  const visibleTasks = useMemo(() => {
    if (!currentUserId || assignmentViewMode === "all") {
      return permissionFilteredTasks;
    }

    return permissionFilteredTasks.filter((task) => {
      if (assignmentViewMode === "assignee") {
        return task.assigneeId === currentUserId;
      }
      const participants = readTaskParticipantIds(task);
      return task.assigneeId === currentUserId || participants.includes(currentUserId);
    });
  }, [assignmentViewMode, currentUserId, permissionFilteredTasks]);

  const visibleTaskMap = useMemo(() => new Map(permissionFilteredTasks.map((task) => [task.id, task])), [permissionFilteredTasks]);
  const filteredTaskMap = useMemo(() => new Map(visibleTasks.map((task) => [task.id, task])), [visibleTasks]);

  const sortedVisibleTasks = useMemo(() => {
    const copied = [...visibleTasks];
    copied.sort((a, b) => compareTasks(a, b, sortMode));
    return copied;
  }, [sortMode, visibleTasks]);

  const tasksByStage = useMemo(() => {
    const grouped: Record<KanbanStage, Task[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      done: []
    };

    for (const task of sortedVisibleTasks) {
      const stage = readKanbanStage(task);
      grouped[stage].push(task);
    }

    return grouped;
  }, [sortedVisibleTasks]);

  const historyItems = useMemo(() => {
    const visibleTaskIdSet = new Set(permissionFilteredHistory.map((task) => task.id));
    return projectHistoryEntries
      .filter((entry) => visibleTaskIdSet.has(entry.task.id))
      .sort((a, b) => historyTimestamp(b.finalizedAt) - historyTimestamp(a.finalizedAt))
      .slice(0, 20);
  }, [permissionFilteredHistory, projectHistoryEntries]);

  const userById = useMemo(() => {
    const map = new Map<string, User>();
    for (const user of users) {
      map.set(user.id, user);
    }
    return map;
  }, [users]);

  const userDisplayById = useMemo(() => {
    return users.reduce<Record<string, string>>((acc, user) => {
      acc[user.id] = user.displayName;
      return acc;
    }, {});
  }, [users]);
  const userAutocompleteOptions = useMemo(
    () =>
      users.map((user) => ({
        id: user.id,
        label: user.displayName,
        secondaryLabel: `@${user.username}`
      })),
    [users]
  );

  const effectiveFocusedTaskId = focusedTaskId && filteredTaskMap.has(focusedTaskId) ? focusedTaskId : null;

  const detailTask = useMemo(() => (detailTaskId ? visibleTaskMap.get(detailTaskId) ?? null : null), [detailTaskId, visibleTaskMap]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (detailTaskId) {
        setDetailTaskId(null);
        setDetailDraft(null);
        setCommentDraft({
          message: "",
          attachments: []
        });
        setEditingCommentId(null);
        setEditingCommentMessage("");
        return;
      }
      if (addTaskPopupOpen) {
        setAddTaskPopupOpen(false);
        return;
      }
      if (historyPopupOpen) {
        setHistoryPopupOpen(false);
        return;
      }
      if (projectPopupOpen) {
        setProjectPopupOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [addTaskPopupOpen, detailTaskId, historyPopupOpen, projectPopupOpen]);

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

  const patchKanbanTask = useCallback(
    (taskId: string, patch: Record<string, unknown>) => {
      if (updateKanbanTask) {
        return normalizeResult(updateKanbanTask(taskId, patch));
      }
      if (updateTask) {
        updateTask(taskId, patch as Partial<Task>);
        return { ok: true } as MutationResult;
      }
      return {
        ok: false,
        reason: "스토어에서 태스크 수정 함수를 찾을 수 없습니다."
      } as MutationResult;
    },
    [updateKanbanTask, updateTask]
  );

  const createKanbanTask = useCallback(
    (input: Record<string, unknown>) => {
      if (addKanbanTask) {
        return normalizeAddResult(addKanbanTask(input));
      }
      if (addTask) {
        addTask(input as never);
        return { ok: true } as AddMutationResult;
      }
      return {
        ok: false,
        reason: "스토어에서 태스크 생성 함수를 찾을 수 없습니다."
      } as AddMutationResult;
    },
    [addKanbanTask, addTask]
  );

  const toTaskAttachments = useCallback(
    async (files: FileList, createdBy: string): Promise<TaskAttachment[]> => {
      const resolved: TaskAttachment[] = [];

      for (const file of Array.from(files)) {
        if (file.size > MAX_ATTACHMENT_FILE_SIZE_BYTES) {
          throw new Error(`${file.name}: 파일 크기는 ${formatFileSize(MAX_ATTACHMENT_FILE_SIZE_BYTES)} 이하만 지원합니다.`);
        }

        const dataUrl = await readFileAsDataUrl(file);
        const mimeType = file.type || "application/octet-stream";
        resolved.push({
          id: makeClientId("task-attachment"),
          name: file.name,
          mimeType,
          kind: resolveAttachmentKind(mimeType),
          size: file.size,
          dataUrl,
          createdAt: new Date().toISOString(),
          createdBy
        });
      }

      return resolved;
    },
    []
  );

  const handleAttachFilesToTask = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      if (!currentUserId || !detailDraft) {
        event.target.value = "";
        return;
      }

      const files = event.target.files;
      event.target.value = "";
      if (!files || files.length === 0) {
        return;
      }

      setDetailAttachmentUploading(true);
      try {
        const uploaded = await toTaskAttachments(files, currentUserId);
        setDetailDraft((previous) => {
          if (!previous) return previous;

          const merged = [...previous.attachments, ...uploaded];
          if (merged.length > MAX_TASK_ATTACHMENTS) {
            toast.warning(`태스크 첨부는 최대 ${MAX_TASK_ATTACHMENTS}개까지 저장할 수 있습니다.`);
          }

          return {
            ...previous,
            attachments: merged.slice(0, MAX_TASK_ATTACHMENTS)
          };
        });
        toast.success(`${uploaded.length}개 첨부 파일을 추가했습니다. 저장하면 반영됩니다.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "첨부 파일을 처리하지 못했습니다.";
        toast.error(message);
      } finally {
        setDetailAttachmentUploading(false);
      }
    },
    [currentUserId, detailDraft, toTaskAttachments]
  );

  const handleRemoveTaskAttachment = useCallback((attachmentId: string) => {
    setDetailDraft((previous) =>
      previous
        ? {
            ...previous,
            attachments: previous.attachments.filter((attachment) => attachment.id !== attachmentId)
          }
        : previous
    );
  }, []);

  const handleAttachFilesToCommentDraft = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      if (!currentUserId) {
        event.target.value = "";
        return;
      }

      const files = event.target.files;
      event.target.value = "";
      if (!files || files.length === 0) {
        return;
      }

      try {
        const uploaded = await toTaskAttachments(files, currentUserId);
        setCommentDraft((previous) => {
          const merged = [...previous.attachments, ...uploaded];
          if (merged.length > MAX_COMMENT_ATTACHMENTS) {
            toast.warning(`댓글 첨부는 최대 ${MAX_COMMENT_ATTACHMENTS}개까지 저장할 수 있습니다.`);
          }

          return {
            ...previous,
            attachments: merged.slice(0, MAX_COMMENT_ATTACHMENTS)
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "댓글 첨부 파일을 처리하지 못했습니다.";
        toast.error(message);
      }
    },
    [currentUserId, toTaskAttachments]
  );

  const handleRemoveCommentAttachment = useCallback((attachmentId: string) => {
    setCommentDraft((previous) => ({
      ...previous,
      attachments: previous.attachments.filter((attachment) => attachment.id !== attachmentId)
    }));
  }, []);

  const handleSubmitComment = useCallback(async () => {
    if (!detailTask || !detailDraft || !currentUserId || !currentUser) {
      return;
    }

    if (!writable) {
      toast.warning("읽기 전용 권한에서는 댓글을 등록할 수 없습니다.");
      return;
    }

    const normalizedMessage = commentDraft.message.trim();
    if (!normalizedMessage && commentDraft.attachments.length === 0) {
      toast.warning("댓글 또는 첨부 파일을 입력해 주세요.");
      return;
    }

    const nextComment: TaskComment = {
      id: makeClientId("task-comment"),
      taskId: detailTask.id,
      authorId: currentUserId,
      authorName: currentUser.displayName,
      message: normalizedMessage || "(첨부 파일)",
      createdAt: new Date().toISOString(),
      attachments: normalizeTaskAttachments(commentDraft.attachments)
    };

    const nextComments = [...detailDraft.comments, nextComment].slice(-MAX_TASK_COMMENTS);

    setCommentSubmitting(true);
    try {
      const patchResult = patchKanbanTask(detailTask.id, {
        comments: nextComments
      });

      if (!patchResult.ok) {
        toast.error(patchResult.reason ?? "댓글을 등록하지 못했습니다.");
        return;
      }

      setDetailDraft((previous) =>
        previous
          ? {
              ...previous,
              comments: nextComments
            }
          : previous
      );
      setCommentDraft({
        message: "",
        attachments: []
      });
      toast.success("댓글을 등록했습니다.");
    } finally {
      setCommentSubmitting(false);
    }
  }, [commentDraft.attachments, commentDraft.message, currentUser, currentUserId, detailDraft, detailTask, patchKanbanTask, writable]);

  const handleStartEditComment = useCallback(
    (comment: TaskComment) => {
      if (!currentUserId || currentUserId !== comment.authorId || !writable) {
        return;
      }

      setEditingCommentId(comment.id);
      setEditingCommentMessage(comment.message);
    },
    [currentUserId, writable]
  );

  const handleCancelEditComment = useCallback(() => {
    setEditingCommentId(null);
    setEditingCommentMessage("");
  }, []);

  const handleSaveEditedComment = useCallback(() => {
    if (!detailTask || !detailDraft || !editingCommentId || !currentUserId) {
      return;
    }

    if (!writable) {
      toast.warning("읽기 전용 권한에서는 댓글을 수정할 수 없습니다.");
      return;
    }

    const targetComment = detailDraft.comments.find((comment) => comment.id === editingCommentId);
    if (!targetComment) {
      toast.error("수정할 댓글을 찾지 못했습니다.");
      return;
    }

    if (targetComment.authorId !== currentUserId) {
      toast.error("작성한 댓글만 수정할 수 있습니다.");
      return;
    }

    const trimmedMessage = editingCommentMessage.trim();
    if (!trimmedMessage) {
      toast.warning("댓글 내용을 입력해 주세요.");
      return;
    }

    const nextComments = detailDraft.comments.map((comment) =>
      comment.id === editingCommentId
        ? {
            ...comment,
            message: trimmedMessage
          }
        : comment
    );

    setCommentActionPending(true);
    try {
      const patchResult = patchKanbanTask(detailTask.id, {
        comments: nextComments
      });

      if (!patchResult.ok) {
        toast.error(patchResult.reason ?? "댓글을 수정하지 못했습니다.");
        return;
      }

      setDetailDraft((previous) =>
        previous
          ? {
              ...previous,
              comments: nextComments
            }
          : previous
      );
      setEditingCommentId(null);
      setEditingCommentMessage("");
      toast.success("댓글을 수정했습니다.");
    } finally {
      setCommentActionPending(false);
    }
  }, [currentUserId, detailDraft, detailTask, editingCommentId, editingCommentMessage, patchKanbanTask, writable]);

  const handleDeleteComment = useCallback(
    (commentId: string) => {
      if (!detailTask || !detailDraft || !currentUserId) {
        return;
      }

      if (!writable) {
        toast.warning("읽기 전용 권한에서는 댓글을 삭제할 수 없습니다.");
        return;
      }

      const targetComment = detailDraft.comments.find((comment) => comment.id === commentId);
      if (!targetComment) {
        toast.error("삭제할 댓글을 찾지 못했습니다.");
        return;
      }

      if (targetComment.authorId !== currentUserId) {
        toast.error("작성한 댓글만 삭제할 수 있습니다.");
        return;
      }

      const confirmed = window.confirm("댓글을 삭제하시겠습니까?");
      if (!confirmed) {
        return;
      }

      const nextComments = detailDraft.comments.filter((comment) => comment.id !== commentId);

      setCommentActionPending(true);
      try {
        const patchResult = patchKanbanTask(detailTask.id, {
          comments: nextComments
        });

        if (!patchResult.ok) {
          toast.error(patchResult.reason ?? "댓글을 삭제하지 못했습니다.");
          return;
        }

        setDetailDraft((previous) =>
          previous
            ? {
                ...previous,
                comments: nextComments
              }
            : previous
        );
        if (editingCommentId === commentId) {
          setEditingCommentId(null);
          setEditingCommentMessage("");
        }
        toast.success("댓글을 삭제했습니다.");
      } finally {
        setCommentActionPending(false);
      }
    },
    [currentUserId, detailDraft, detailTask, editingCommentId, patchKanbanTask, writable]
  );

  const moveTaskStage = useCallback(
    (task: Task, nextStage: KanbanStage): MutationResult => {
      const currentStage = readKanbanStage(task);
      if (currentStage === nextStage) {
        return { ok: true };
      }

      return normalizeResult(moveKanbanTask(task.id, nextStage));
    },
    [moveKanbanTask]
  );

  const applyMoves = useCallback(
    (taskIds: string[], nextStage: KanbanStage, source: MoveSource) => {
      if (!writable) {
        toast.warning("읽기 전용 권한에서는 상태를 변경할 수 없습니다.");
        return;
      }

      const uniqueIds = [...new Set(taskIds)];
      const failures: string[] = [];
      let movedCount = 0;

      uniqueIds.forEach((taskId) => {
        const task = visibleTaskMap.get(taskId);
        if (!task) return;

        const result = moveTaskStage(task, nextStage);
        if (result.ok) {
          movedCount += 1;
        } else {
          failures.push(result.reason ?? taskId);
        }
      });

      if (movedCount > 0) {
        toast.success(`${movedCount}개 작업을 ${STAGE_LABEL[nextStage]}로 이동했습니다. (${SOURCE_LABEL[source]})`);
      }

      if (failures.length > 0) {
        toast.error(`이동 실패 ${failures.length}건: ${failures[0] ?? "알 수 없는 오류"}`);
      }
    },
    [moveTaskStage, visibleTaskMap, writable]
  );

  const cycleAssignmentViewMode = useCallback(() => {
    setAssignmentViewMode((previous) => {
      const currentIndex = assignmentModeOrder.indexOf(previous);
      return assignmentModeOrder[(currentIndex + 1) % assignmentModeOrder.length] ?? "all";
    });
  }, []);

  const cycleSortMode = useCallback(() => {
    setSortMode((previous) => {
      const currentIndex = sortModeOrder.indexOf(previous);
      return sortModeOrder[(currentIndex + 1) % sortModeOrder.length] ?? "updated";
    });
  }, []);

  const openAddTaskPopup = useCallback(() => {
    setNewTaskDraft(createNewTaskDraft(projectId, currentUserId, users));
    setAddTaskPopupOpen(true);
  }, [currentUserId, projectId, users]);

  const isAssignedToCurrentUser = useCallback(
    (task: Task) => {
      if (!currentUserId) return false;
      const participants = readTaskParticipantIds(task);
      return task.assigneeId === currentUserId || participants.includes(currentUserId);
    },
    [currentUserId]
  );

  const openDetailPopup = useCallback(
    (taskId: string) => {
      const target = visibleTaskMap.get(taskId);
      if (!target) return;
      setDetailTaskId(taskId);
      setDetailDraft(createDetailDraft(target));
      setCommentDraft({
        message: "",
        attachments: []
      });
      setEditingCommentId(null);
      setEditingCommentMessage("");
    },
    [visibleTaskMap]
  );

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
      const draggedTask = visibleTaskMap.get(activeId);
      if (!draggedTask) return;

      const overId = String(over.id);
      const destinationStage: KanbanStage | undefined = isKanbanStage(overId)
        ? overId
        : (() => {
            const overTask = visibleTaskMap.get(overId);
            return overTask ? readKanbanStage(overTask) : undefined;
          })();

      if (!destinationStage || destinationStage === readKanbanStage(draggedTask)) {
        return;
      }

      applyMoves([activeId], destinationStage, "drag");
    },
    [applyMoves, visibleTaskMap, writable]
  );

  const handleSelectProject = useCallback(
    (nextProjectId: string) => {
      if (nextProjectId === projectId) {
        setProjectPopupOpen(false);
        return;
      }

      setProjectPopupOpen(false);
      setDetailTaskId(null);
      setDetailDraft(null);
      setCommentDraft({
        message: "",
        attachments: []
      });
      setEditingCommentId(null);
      setEditingCommentMessage("");
      setAddTaskPopupOpen(false);
      setHistoryPopupOpen(false);
      router.push(`/app/projects/${nextProjectId}/kanban`);
    },
    [projectId, router]
  );

  const handleCreateProject = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!writable) {
        toast.warning("읽기 전용 모드에서는 프로젝트를 추가할 수 없습니다.");
        return;
      }

      const result = addProject({
        name: newProjectForm.name,
        description: newProjectForm.description
      });

      if (!result.ok || !result.projectId) {
        toast.error(result.reason ?? "프로젝트를 추가하지 못했습니다.");
        return;
      }

      toast.success("새 프로젝트를 만들었습니다.");
      setNewProjectForm({ name: "", description: "" });
      setProjectPopupOpen(false);
      router.push(`/app/projects/${result.projectId}/kanban`);
    },
    [addProject, newProjectForm.description, newProjectForm.name, router, writable]
  );

  const handleCreateTask = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!newTaskDraft.title.trim()) {
        toast.warning("작업 제목을 입력해 주세요.");
        return;
      }

      if (!newTaskDraft.assigneeId) {
        toast.warning("담당자를 선택해 주세요.");
        return;
      }

      const dueDateIso = dateInputToIso(newTaskDraft.dueDate);
      if (!dueDateIso) {
        toast.warning("유효한 마감일을 입력해 주세요.");
        return;
      }

      const participantIds = ensureAssigneeInParticipants(newTaskDraft.participantIds, newTaskDraft.assigneeId);
      const payload: Record<string, unknown> = {
        projectId,
        title: newTaskDraft.title.trim(),
        description: newTaskDraft.description.trim(),
        status: newTaskDraft.stage,
        priority: numberToLegacyPriority(newTaskDraft.priority),
        assigneeId: newTaskDraft.assigneeId,
        participantIds,
        ownerId: newTaskDraft.ownerId || newTaskDraft.assigneeId,
        reporterId: currentUserId ?? newTaskDraft.assigneeId,
        dueDate: dueDateIso,
        visibility: newTaskDraft.visibility,
        tags: buildKanbanTags([], newTaskDraft.stage, newTaskDraft.priority)
      };

      const result = createKanbanTask(payload);
      if (!result.ok) {
        toast.error(result.reason ?? "작업을 추가하지 못했습니다.");
        return;
      }

      toast.success("작업을 추가했습니다.");
      setAddTaskPopupOpen(false);
      setNewTaskDraft(createNewTaskDraft(projectId, currentUserId, users));
    },
    [createKanbanTask, currentUserId, newTaskDraft, projectId, users]
  );

  const handleSaveDetail = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!detailTask || !detailDraft) {
        return;
      }

      if (!writable) {
        toast.warning("읽기 전용 모드에서는 수정할 수 없습니다.");
        return;
      }

      if (!detailDraft.title.trim()) {
        toast.warning("작업 제목을 입력해 주세요.");
        return;
      }

      if (!detailDraft.assigneeId) {
        toast.warning("담당자를 선택해 주세요.");
        return;
      }

      const dueDateIso = dateInputToIso(detailDraft.dueDate);
      if (!dueDateIso) {
        toast.warning("유효한 마감일을 입력해 주세요.");
        return;
      }

      const participantIds = ensureAssigneeInParticipants(detailDraft.participantIds, detailDraft.assigneeId);
      const currentStage = readKanbanStage(detailTask);
      const nextStage = detailDraft.stage;

      if (currentStage !== nextStage) {
        const moveResult = moveTaskStage(detailTask, nextStage);
        if (!moveResult.ok) {
          toast.error(moveResult.reason ?? "상태를 변경하지 못했습니다.");
          return;
        }
      }

      const patchResult = patchKanbanTask(detailTask.id, {
        title: detailDraft.title.trim(),
        description: detailDraft.description.trim(),
        assigneeId: detailDraft.assigneeId,
        ownerId: detailDraft.ownerId || detailDraft.assigneeId,
        participantIds,
        dueDate: dueDateIso,
        visibility: detailDraft.visibility,
        attachments: normalizeTaskAttachments(detailDraft.attachments),
        comments: normalizeTaskComments(detailDraft.comments, detailTask.id),
        status: detailDraft.stage,
        priority: numberToLegacyPriority(detailDraft.priority),
        tags: buildKanbanTags(detailTask.tags, detailDraft.stage, detailDraft.priority)
      });

      if (!patchResult.ok) {
        toast.error(patchResult.reason ?? "작업을 업데이트하지 못했습니다.");
        return;
      }

      toast.success("작업을 업데이트했습니다.");
      setDetailTaskId(null);
      setDetailDraft(null);
      setCommentDraft({
        message: "",
        attachments: []
      });
      setEditingCommentId(null);
      setEditingCommentMessage("");
    },
    [detailDraft, detailTask, moveTaskStage, patchKanbanTask, writable]
  );

  const handleDeleteDetailTask = useCallback(() => {
    if (!detailTask) {
      return;
    }

    if (!writable) {
      toast.warning("읽기 전용 모드에서는 삭제할 수 없습니다.");
      return;
    }

    if (!removeKanbanTask) {
      toast.error("스토어에서 removeKanbanTask를 찾지 못했습니다.");
      return;
    }

    const confirmed = window.confirm(`"${detailTask.title}" 작업을 삭제하시겠습니까?`);
    if (!confirmed) {
      return;
    }

    const result = normalizeResult(removeKanbanTask(detailTask.id));
    if (!result.ok) {
      toast.error(result.reason ?? "작업을 삭제하지 못했습니다.");
      return;
    }

    toast.success("작업을 삭제했습니다.");
    setDetailTaskId(null);
    setDetailDraft(null);
    setCommentDraft({
      message: "",
      attachments: []
    });
    setEditingCommentId(null);
    setEditingCommentMessage("");
  }, [detailTask, removeKanbanTask, writable]);

  const handleFinalizeTask = useCallback(
    (taskId: string) => {
      if (!writable) {
        toast.warning("읽기 전용 모드에서는 최종완료를 처리할 수 없습니다.");
        return;
      }

      if (!finalizeKanbanTask) {
        toast.error("스토어에서 finalizeKanbanTask를 찾지 못했습니다.");
        return;
      }

      const result = normalizeResult(finalizeKanbanTask(taskId));
      if (!result.ok) {
        toast.error(result.reason ?? "최종완료 처리에 실패했습니다.");
        return;
      }

      toast.success("작업을 히스토리로 이동했습니다.");
    },
    [finalizeKanbanTask, writable]
  );

  const handleRestoreTask = useCallback(
    (taskId: string) => {
      if (!writable) {
        toast.warning("읽기 전용 모드에서는 복원할 수 없습니다.");
        return;
      }

      if (!restoreKanbanTask) {
        toast.error("스토어에서 restoreKanbanTask를 찾지 못했습니다.");
        return;
      }

      const result = normalizeResult(restoreKanbanTask(taskId));
      if (!result.ok) {
        toast.error(result.reason ?? "히스토리 복원에 실패했습니다.");
        return;
      }

      toast.success("작업을 Done으로 복원했습니다.");
    },
    [restoreKanbanTask, writable]
  );

  const activeTask = activeDragId ? filteredTaskMap.get(activeDragId) ?? visibleTaskMap.get(activeDragId) ?? null : null;

  if (!project) {
    return (
      <Card className={NEO_CARD_CLASS}>
        <CardTitle>Project not found</CardTitle>
        <CardDescription className="mt-1">
          The project ID <code>{projectId}</code> does not exist.
        </CardDescription>
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

  const assignmentMode = assignmentModeMeta[assignmentViewMode];
  const AssignmentModeIcon = assignmentMode.icon;

  return (
    <section className="space-y-3" aria-label="Kanban board">
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-zinc-900 bg-white px-2.5 py-2 shadow-[3px_3px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[3px_3px_0_0_rgb(0,0,0)]">
        <Button
          size="sm"
          variant={projectPopupOpen ? "secondary" : "outline"}
          className={cn("h-7 max-w-[220px] gap-1 px-2 text-xs", TOOLBAR_CONTROL_CLASS)}
          onClick={() => setProjectPopupOpen((previous) => !previous)}
          title="프로젝트 선택/추가"
          aria-pressed={projectPopupOpen}
        >
          <FolderKanban className="h-3.5 w-3.5" />
          <span className="truncate">{project.name}</span>
        </Button>

        <Button
          size="sm"
          variant={assignmentViewMode === "all" ? "outline" : "secondary"}
          className={cn("h-7 gap-1 px-2 text-xs", TOOLBAR_CONTROL_CLASS)}
          onClick={cycleAssignmentViewMode}
          title={`할당 필터: ${assignmentMode.label}`}
        >
          <AssignmentModeIcon className="h-3.5 w-3.5" />
          <span>{assignmentMode.shortLabel}</span>
        </Button>

        <Button
          size="sm"
          variant={highlightMyAssignments ? "secondary" : "outline"}
          className={cn("h-7 gap-1 px-2 text-xs", TOOLBAR_CONTROL_CLASS)}
          onClick={() => setHighlightMyAssignments((previous) => !previous)}
          title="나에게 지정된 작업 강조"
          aria-pressed={highlightMyAssignments}
        >
          {highlightMyAssignments ? <CheckSquare2 className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          <span>강조</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          className={cn("h-7 px-2 text-xs", TOOLBAR_CONTROL_CLASS)}
          onClick={cycleSortMode}
          title="정렬 방식 변경"
        >
          <span>정렬: {sortModeMeta[sortMode].label}</span>
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            size="icon"
            variant="outline"
            className={cn("h-7 w-7", TOOLBAR_CONTROL_CLASS)}
            onClick={openAddTaskPopup}
            title="작업 추가"
          >
            <CirclePlus className="h-3.5 w-3.5" />
          </Button>

          <Button
            size="sm"
            variant={historyPopupOpen ? "secondary" : "outline"}
            className={cn("h-7 px-2 text-xs", TOOLBAR_CONTROL_CLASS)}
            onClick={() => setHistoryPopupOpen(true)}
            aria-pressed={historyPopupOpen}
          >
            History
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid gap-3 xl:grid-cols-4">
          {COLUMNS.map((column) => (
            <KanbanColumn
              key={column.id}
              id={column.id}
              title={column.title}
              tone={column.tone}
              tasks={tasksByStage[column.id]}
              writable={writable}
              focusedTaskId={effectiveFocusedTaskId}
              userById={userById}
              userDisplayById={userDisplayById}
              highlightMyAssignments={highlightMyAssignments}
              isAssignedToCurrentUser={isAssignedToCurrentUser}
              onFocusTask={setFocusedTaskId}
              onQuickAction={(taskId, nextStage) => applyMoves([taskId], nextStage, "quick")}
              onOpenDetail={openDetailPopup}
              onFinalizeTask={handleFinalizeTask}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <div className={cn("w-[300px] rounded-xl border-2 border-zinc-900 p-2.5 shadow-[4px_4px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:shadow-[4px_4px_0_0_rgb(0,0,0)]", taskSurfaceTone(readKanbanStage(activeTask)))}>
              <span className={cn("mb-2 block h-1.5 w-10 rounded-full", taskAccentTone(readKanbanStage(activeTask)))} />
              <p className="text-sm font-semibold">{activeTask.title}</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {STAGE_LABEL[readKanbanStage(activeTask)]} · P{readKanbanPriority(activeTask)}
              </p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <PopupShell
        open={projectPopupOpen}
        onClose={() => setProjectPopupOpen(false)}
        title="프로젝트 선택 / 추가"
        description="프로젝트를 전환하거나 새 프로젝트를 만들 수 있습니다."
        widthClassName="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">프로젝트 목록</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {projects.map((item) => {
                const active = item.id === projectId;
                return (
                  <button
                    key={`kanban-project-option-${item.id}`}
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition",
                      active
                        ? "border-sky-500 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-300"
                        : "border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    )}
                    onClick={() => handleSelectProject(item.id)}
                  >
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{item.description || "설명 없음"}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <form className="space-y-3 rounded-lg border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-700/80 dark:bg-zinc-900/60" onSubmit={handleCreateProject}>
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">프로젝트 추가</p>
            <Input
              value={newProjectForm.name}
              onChange={(event) => setNewProjectForm((previous) => ({ ...previous, name: event.target.value }))}
              placeholder="프로젝트명"
              disabled={!writable}
            />
            <Input
              value={newProjectForm.description}
              onChange={(event) => setNewProjectForm((previous) => ({ ...previous, description: event.target.value }))}
              placeholder="설명 (선택)"
              disabled={!writable}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={!writable}>
                <CirclePlus className="h-4 w-4" />
                프로젝트 추가
              </Button>
            </div>
          </form>
        </div>
      </PopupShell>

      <PopupShell
        open={addTaskPopupOpen}
        onClose={() => setAddTaskPopupOpen(false)}
        title="작업 추가"
        description="To do 상태와 우선순위(1~7)를 포함해 새 작업을 만듭니다."
        widthClassName="max-w-3xl"
      >
        <form className="space-y-4" onSubmit={handleCreateTask}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">제목</p>
              <Input
                value={newTaskDraft.title}
                onChange={(event) => setNewTaskDraft((previous) => ({ ...previous, title: event.target.value }))}
                placeholder="작업 제목"
                required
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">설명</p>
              <textarea
                value={newTaskDraft.description}
                onChange={(event) => setNewTaskDraft((previous) => ({ ...previous, description: event.target.value }))}
                placeholder="설명"
                className="h-24 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-offset-white transition focus-visible:ring-2 focus-visible:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:ring-offset-zinc-900 dark:focus-visible:ring-zinc-700"
              />
            </div>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">상태</span>
              <select
                value={newTaskDraft.stage}
                onChange={(event) => setNewTaskDraft((previous) => ({ ...previous, stage: event.target.value as KanbanStage }))}
                className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-visible:ring-zinc-700"
              >
                {COLUMNS.map((column) => (
                  <option key={`new-stage-${column.id}`} value={column.id}>
                    {column.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">우선순위 (1~7)</span>
              <select
                value={String(newTaskDraft.priority)}
                onChange={(event) =>
                  setNewTaskDraft((previous) => ({
                    ...previous,
                    priority: sanitizePriority(Number(event.target.value))
                  }))
                }
                className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-visible:ring-zinc-700"
              >
                {Array.from({ length: 7 }, (_, index) => index + 1).map((value) => (
                  <option key={`new-priority-${value}`} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">담당자</span>
              <UserAutocompleteSelect
                value={newTaskDraft.assigneeId}
                onChange={(assigneeId) => {
                  setNewTaskDraft((previous) => ({
                    ...previous,
                    assigneeId,
                    participantIds: ensureAssigneeInParticipants(previous.participantIds, assigneeId)
                  }));
                }}
                options={userAutocompleteOptions}
                placeholder="담당자 이름 입력"
                allowClear={false}
                inputClassName="h-9"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Owner</span>
              <UserAutocompleteSelect
                value={newTaskDraft.ownerId}
                onChange={(ownerId) => setNewTaskDraft((previous) => ({ ...previous, ownerId }))}
                options={userAutocompleteOptions}
                placeholder="Owner 이름 입력"
                allowClear={false}
                inputClassName="h-9"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">마감일</span>
              <Input
                type="date"
                value={newTaskDraft.dueDate}
                onChange={(event) => setNewTaskDraft((previous) => ({ ...previous, dueDate: event.target.value }))}
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Visibility</span>
              <select
                value={newTaskDraft.visibility}
                onChange={(event) => setNewTaskDraft((previous) => ({ ...previous, visibility: event.target.value as "shared" | "private" }))}
                className="h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-visible:ring-zinc-700"
              >
                <option value="shared">shared</option>
                <option value="private">private</option>
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">참여자</p>
            <UserAutocompleteMultiSelect
              options={userAutocompleteOptions}
              selectedIds={ensureAssigneeInParticipants(newTaskDraft.participantIds, newTaskDraft.assigneeId)}
              lockedIds={newTaskDraft.assigneeId ? [newTaskDraft.assigneeId] : []}
              onChange={(nextSelectedIds) =>
                setNewTaskDraft((previous) => ({
                  ...previous,
                  participantIds: ensureAssigneeInParticipants(nextSelectedIds, previous.assigneeId)
                }))
              }
              placeholder="참여자 이름 입력"
              inputClassName="h-9"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAddTaskPopupOpen(false)}>
              취소
            </Button>
            <Button type="submit">
              <CirclePlus className="h-4 w-4" />
              작업 추가
            </Button>
          </div>
        </form>
      </PopupShell>

      <PopupShell
        open={historyPopupOpen}
        onClose={() => setHistoryPopupOpen(false)}
        title="History"
        description="현재 프로젝트의 최종완료 작업입니다. 최신 완료순으로 최대 20개까지 표시됩니다."
      >
        <div className="space-y-2">
          {historyItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300/90 px-3 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              완료 히스토리가 없습니다.
            </div>
          ) : (
            historyItems.map((entry) => {
              const task = entry.task;
              const assignee = userById.get(task.assigneeId);
              return (
                <div
                  key={`history-task-${entry.historyId}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200/80 bg-zinc-50/70 px-3 py-2.5 dark:border-zinc-700/80 dark:bg-zinc-900/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{task.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <Badge variant="neutral">P{readKanbanPriority(task)}</Badge>
                      <span>담당: {assignee?.displayName ?? task.assigneeId}</span>
                      <span>마감: {formatDate(task.dueDate)}</span>
                      <span>완료: {formatDateTime(entry.finalizedAt)}</span>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!writable}
                    onClick={() => {
                      handleRestoreTask(entry.historyId);
                    }}
                    className="h-7 px-2 text-xs"
                  >
                    복원
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </PopupShell>

      <PopupShell
        open={Boolean(detailTask && detailDraft)}
        onClose={() => {
          setDetailTaskId(null);
          setDetailDraft(null);
          setCommentDraft({
            message: "",
            attachments: []
          });
          setEditingCommentId(null);
          setEditingCommentMessage("");
        }}
        title={detailDraft?.title?.trim() || detailTask?.title || "작업 상세"}
        editableTitle={
          detailDraft
            ? {
                value: detailDraft.title,
                onChange: (nextValue) =>
                  setDetailDraft((previous) => (previous ? { ...previous, title: nextValue } : previous)),
                disabled: !writable,
                placeholder: "작업 제목"
              }
            : undefined
        }
        widthClassName="max-w-3xl"
      >
        {detailTask && detailDraft ? (
          <form className="space-y-4" onSubmit={handleSaveDetail}>
            <div className="space-y-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">설명</span>
              <textarea
                value={detailDraft.description}
                onChange={(event) => setDetailDraft((previous) => (previous ? { ...previous, description: event.target.value } : previous))}
                disabled={!writable}
                rows={4}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-offset-white transition focus-visible:ring-2 focus-visible:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:ring-offset-zinc-900 dark:focus-visible:ring-zinc-700"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">마감일</span>
                <Input
                  type="date"
                  value={detailDraft.dueDate}
                  onChange={(event) => setDetailDraft((previous) => (previous ? { ...previous, dueDate: event.target.value } : previous))}
                  disabled={!writable}
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">담당자</span>
                <UserAutocompleteSelect
                  value={detailDraft.assigneeId}
                  onChange={(assigneeId) => {
                    setDetailDraft((previous) =>
                      previous
                        ? {
                            ...previous,
                            assigneeId,
                            participantIds: ensureAssigneeInParticipants(previous.participantIds, assigneeId)
                          }
                        : previous
                    );
                  }}
                  options={userAutocompleteOptions}
                  placeholder="담당자 이름 입력"
                  allowClear={false}
                  inputClassName="h-10"
                  disabled={!writable}
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">우선순위</span>
                <select
                  value={String(detailDraft.priority)}
                  onChange={(event) =>
                    setDetailDraft((previous) =>
                      previous
                        ? {
                            ...previous,
                            priority: sanitizePriority(Number(event.target.value))
                          }
                        : previous
                    )
                  }
                  className="h-10 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-visible:ring-zinc-700"
                  disabled={!writable}
                >
                  {Array.from({ length: 7 }, (_, index) => index + 1).map((value) => (
                    <option key={`detail-priority-${value}`} value={value}>
                      P{value}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-700/80 dark:bg-zinc-900/60">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">참여자</p>
                  <div className="mt-2">
                    <UserAutocompleteMultiSelect
                      options={userAutocompleteOptions}
                      selectedIds={ensureAssigneeInParticipants(detailDraft.participantIds, detailDraft.assigneeId)}
                      lockedIds={detailDraft.assigneeId ? [detailDraft.assigneeId] : []}
                      onChange={(nextSelectedIds) =>
                        setDetailDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                participantIds: ensureAssigneeInParticipants(nextSelectedIds, previous.assigneeId)
                              }
                            : previous
                        )
                      }
                      placeholder="참여자 이름 입력"
                      inputClassName="h-10"
                      disabled={!writable}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">공개 범위</p>
                  <div className="mt-2 inline-flex rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
                    <button
                      type="button"
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                        detailDraft.visibility === "shared"
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      )}
                      onClick={() =>
                        setDetailDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                visibility: "shared"
                              }
                            : previous
                        )
                      }
                      disabled={!writable}
                    >
                      shared
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                        detailDraft.visibility === "private"
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      )}
                      onClick={() =>
                        setDetailDraft((previous) =>
                          previous
                            ? {
                                ...previous,
                                visibility: "private"
                              }
                            : previous
                        )
                      }
                      disabled={!writable}
                    >
                      private
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-700/80 dark:bg-zinc-900/60">
              <div className="flex items-center justify-between gap-2">
                <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <Paperclip className="h-3.5 w-3.5" />
                  태스크 첨부 파일
                </p>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
                  <CirclePlus className="h-3.5 w-3.5" />
                  파일 추가
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    accept={TASK_ATTACHMENT_ACCEPT}
                    onChange={handleAttachFilesToTask}
                    disabled={!writable || detailAttachmentUploading}
                  />
                </label>
              </div>

              {detailDraft.attachments.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">첨부된 파일이 없습니다.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {detailDraft.attachments.map((attachment) => (
                    <li
                      key={attachment.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <a
                        href={attachment.dataUrl}
                        download={attachment.name}
                        className="min-w-0 flex-1 truncate text-zinc-700 underline decoration-dotted underline-offset-2 dark:text-zinc-200"
                        title={attachment.name}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {attachment.name}
                        <span className="ml-1 text-[10px] text-zinc-500 dark:text-zinc-400">({formatFileSize(attachment.size)})</span>
                      </a>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => handleRemoveTaskAttachment(attachment.id)}
                        disabled={!writable}
                        title="첨부 제거"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-700/80 dark:bg-zinc-900/60">
              <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <MessageSquare className="h-3.5 w-3.5" />
                댓글 ({detailDraft.comments.length})
              </p>

              <div className="mt-2 space-y-2">
                {detailDraft.comments.length === 0 ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">등록된 댓글이 없습니다.</p>
                ) : (
                  detailDraft.comments
                    .slice()
                    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
                    .map((comment) => {
                      const isCommentAuthor = Boolean(currentUserId && currentUserId === comment.authorId);
                      const canManageComment = isCommentAuthor && writable;
                      const isEditingComment = isCommentAuthor && editingCommentId === comment.id;

                      return (
                        <article key={comment.id} className="rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-zinc-700 dark:text-zinc-200">{comment.authorName}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{formatDateTime(comment.createdAt)}</span>
                              {canManageComment ? (
                                <div className="ml-1 flex items-center gap-0.5">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    onClick={() => handleStartEditComment(comment)}
                                    disabled={commentSubmitting || commentActionPending}
                                    title="댓글 수정"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-rose-600 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200"
                                    onClick={() => handleDeleteComment(comment.id)}
                                    disabled={commentSubmitting || commentActionPending}
                                    title="댓글 삭제"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          {isEditingComment ? (
                            <div className="mt-1.5 space-y-1.5">
                              <textarea
                                value={editingCommentMessage}
                                onChange={(event) => setEditingCommentMessage(event.target.value)}
                                rows={3}
                                className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-visible:ring-zinc-700"
                                disabled={commentActionPending}
                              />
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={handleCancelEditComment}
                                  disabled={commentActionPending}
                                >
                                  <X className="h-3 w-3" />
                                  취소
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 px-2 text-[11px]"
                                  onClick={handleSaveEditedComment}
                                  disabled={commentActionPending}
                                >
                                  <Check className="h-3 w-3" />
                                  저장
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-200">{comment.message}</p>
                          )}

                          {comment.attachments.length > 0 ? (
                            <ul className="mt-1.5 space-y-1">
                              {comment.attachments.map((attachment) => (
                                <li key={attachment.id} className="truncate">
                                  <a
                                    href={attachment.dataUrl}
                                    download={attachment.name}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-zinc-600 underline decoration-dotted underline-offset-2 dark:text-zinc-300"
                                  >
                                    {attachment.name}
                                    <span className="ml-1 text-[10px] text-zinc-500 dark:text-zinc-400">({formatFileSize(attachment.size)})</span>
                                  </a>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </article>
                      );
                    })
                )}
              </div>

              <div className="mt-3 rounded-md border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900">
                <textarea
                  value={commentDraft.message}
                  onChange={(event) =>
                    setCommentDraft((previous) => ({
                      ...previous,
                      message: event.target.value
                    }))
                  }
                  placeholder="댓글을 입력하세요."
                  rows={3}
                  disabled={!writable || commentSubmitting}
                  className="w-full rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-visible:ring-zinc-700"
                />

                {commentDraft.attachments.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {commentDraft.attachments.map((attachment) => (
                      <li key={attachment.id} className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700">
                        <span className="truncate text-zinc-600 dark:text-zinc-300">
                          {attachment.name}
                          <span className="ml-1 text-[10px] text-zinc-500 dark:text-zinc-400">({formatFileSize(attachment.size)})</span>
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => handleRemoveCommentAttachment(attachment.id)}
                          disabled={!writable || commentSubmitting}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800">
                    <Paperclip className="h-3.5 w-3.5" />
                    댓글 파일 첨부
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      accept={TASK_ATTACHMENT_ACCEPT}
                      onChange={handleAttachFilesToCommentDraft}
                      disabled={!writable || commentSubmitting}
                    />
                  </label>

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      void handleSubmitComment();
                    }}
                    disabled={!writable || commentSubmitting || commentActionPending || detailDraft.comments.length >= MAX_TASK_COMMENTS}
                  >
                    <Send className="h-3.5 w-3.5" />
                    댓글 등록
                  </Button>
                </div>
              </div>
            </div>

            {!writable ? <p className="text-xs text-amber-600 dark:text-amber-300">읽기 전용 권한에서는 수정할 수 없습니다.</p> : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDetailTaskId(null);
                  setDetailDraft(null);
                  setCommentDraft({
                    message: "",
                    attachments: []
                  });
                  setEditingCommentId(null);
                  setEditingCommentMessage("");
                }}
              >
                취소
              </Button>
              <Button type="button" variant="danger" onClick={handleDeleteDetailTask} disabled={!writable}>
                삭제
              </Button>
              <Button type="submit" disabled={!writable}>
                저장
              </Button>
            </div>
          </form>
        ) : null}
      </PopupShell>
    </section>
  );
}

function KanbanColumn({
  id,
  title,
  tone,
  tasks,
  writable,
  focusedTaskId,
  userById,
  userDisplayById,
  highlightMyAssignments,
  isAssignedToCurrentUser,
  onFocusTask,
  onQuickAction,
  onOpenDetail,
  onFinalizeTask
}: {
  id: KanbanStage;
  title: string;
  tone: "neutral" | "info" | "warning" | "success";
  tasks: Task[];
  writable: boolean;
  focusedTaskId: string | null;
  userById: Map<string, User>;
  userDisplayById: Record<string, string>;
  highlightMyAssignments: boolean;
  isAssignedToCurrentUser: (task: Task) => boolean;
  onFocusTask: (taskId: string) => void;
  onQuickAction: (taskId: string, nextStage: KanbanStage) => void;
  onOpenDetail: (taskId: string) => void;
  onFinalizeTask: (taskId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    disabled: !writable
  });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "rounded-xl border-2 border-zinc-900 bg-zinc-100 p-2.5 shadow-[3px_3px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900/50 dark:shadow-[3px_3px_0_0_rgb(0,0,0)]",
        isOver && writable && "border-sky-600 bg-sky-100/65 dark:border-sky-400 dark:bg-sky-950/40"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{title}</h2>
        <Badge variant={tone}>{tasks.length}</Badge>
      </div>

      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {tasks.map((task) => (
            <KanbanTaskCard
              key={task.id}
              task={task}
              stage={readKanbanStage(task)}
              writable={writable}
              focused={focusedTaskId === task.id}
              assignee={userDisplayById[task.assigneeId] ?? task.assigneeId}
              assigneeUser={userById.get(task.assigneeId)}
              highlighted={highlightMyAssignments && isAssignedToCurrentUser(task)}
              onFocus={onFocusTask}
              onQuickAction={onQuickAction}
              onOpenDetail={onOpenDetail}
              onFinalizeTask={onFinalizeTask}
            />
          ))}
          {tasks.length === 0 ? (
            <div className="rounded-md border-2 border-dashed border-zinc-900 px-3 py-5 text-center text-xs text-zinc-500 dark:border-zinc-100 dark:text-zinc-400">
              Drop tasks here
            </div>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}

function UserAvatar({ user, fallbackLabel }: { user?: User; fallbackLabel: string }) {
  const symbol = user?.icon?.trim() || fallbackLabel.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-zinc-900 bg-zinc-200 text-[10px] font-semibold text-zinc-700 dark:border-zinc-100 dark:bg-zinc-700 dark:text-zinc-100">
      {symbol}
    </span>
  );
}

function KanbanTaskCard({
  task,
  stage,
  writable,
  focused,
  assignee,
  assigneeUser,
  highlighted,
  onFocus,
  onQuickAction,
  onOpenDetail,
  onFinalizeTask
}: {
  task: Task;
  stage: KanbanStage;
  writable: boolean;
  focused: boolean;
  assignee: string;
  assigneeUser?: User;
  highlighted: boolean;
  onFocus: (taskId: string) => void;
  onQuickAction: (taskId: string, nextStage: KanbanStage) => void;
  onOpenDetail: (taskId: string) => void;
  onFinalizeTask: (taskId: string) => void;
}) {
  const { attributes, listeners, isDragging, setNodeRef, transform, transition } = useSortable({
    id: task.id,
    disabled: !writable
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const quickAction = getQuickAction(stage);
  const QuickActionIcon = quickAction.icon;
  const { onKeyDown: sortableOnKeyDown, ...sortableListeners } = listeners ?? {};

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...sortableListeners}
      tabIndex={0}
      onFocus={() => onFocus(task.id)}
      onClick={() => onFocus(task.id)}
      onKeyDown={(event) => {
        sortableOnKeyDown?.(event);
        if (event.defaultPrevented || event.currentTarget !== event.target) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpenDetail(task.id);
      }}
      onDoubleClick={(event) => {
        if (event.button !== 0) return;
        onOpenDetail(task.id);
      }}
      className={cn(
        "group relative rounded-xl border-2 border-zinc-900 px-2.5 py-2 shadow-[3px_3px_0_0_rgb(24,24,27)] outline-none dark:border-zinc-100 dark:shadow-[3px_3px_0_0_rgb(0,0,0)]",
        CARD_INTERACTION_CLASS,
        taskSurfaceTone(stage),
        writable ? "cursor-grab active:cursor-grabbing" : "",
        writable && !isDragging && "hover:shadow-md",
        highlighted &&
          "border-fuchsia-400/80 bg-fuchsia-100/85 ring-2 ring-fuchsia-300/75 shadow-[0_0_0_2px_rgba(217,70,239,0.22)] dark:border-fuchsia-600/75 dark:bg-fuchsia-900/45 dark:ring-fuchsia-700/70 dark:shadow-[0_0_0_2px_rgba(192,38,211,0.22)]",
        focused && "ring-2 ring-zinc-300 dark:ring-zinc-600",
        isDragging && "opacity-55"
      )}
      title="더블 클릭 또는 Enter/Space로 상세 보기"
    >
      <span className={cn("mb-1 block h-1.5 w-9 rounded-full", taskAccentTone(stage))} />
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{task.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{task.description}</p>
        </div>

        <div
          className={cn(
            "rounded p-1 text-zinc-400 transition-colors duration-150 ease-out motion-reduce:transition-none",
            writable
              ? "group-hover:bg-zinc-100 group-hover:text-zinc-700 dark:group-hover:bg-zinc-800 dark:group-hover:text-zinc-200"
              : "opacity-40"
          )}
          aria-hidden
        >
          <GripVertical className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        <Badge variant="neutral">P{readKanbanPriority(task)}</Badge>
        <span className="inline-flex items-center gap-1">
          <UserAvatar user={assigneeUser} fallbackLabel={assignee} />
          <span className="max-w-[120px] truncate">{assignee}</span>
        </span>
        <span>Due: {formatDate(task.dueDate)}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
        <Button
          size="sm"
          variant={quickActionButtonVariant(quickAction.nextStage)}
          disabled={!writable}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onQuickAction(task.id, quickAction.nextStage);
          }}
          className={cn("h-7 px-2 text-xs", TOOLBAR_CONTROL_CLASS, quickActionButtonTone(quickAction.nextStage))}
        >
          <QuickActionIcon className="h-3.5 w-3.5" />
          {quickAction.label}
        </Button>

        {stage === "done" ? (
          <Button
            size="sm"
            variant="default"
            disabled={!writable}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onFinalizeTask(task.id);
            }}
            className={cn("h-7 px-2 text-xs", TOOLBAR_CONTROL_CLASS)}
          >
            최종완료
          </Button>
        ) : null}
      </div>
    </article>
  );
}
