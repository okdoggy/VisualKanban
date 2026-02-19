"use client";

import { DragEvent as ReactDragEvent, FormEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  FileSpreadsheet,
  FolderKanban,
  Search,
  Square,
  Trash2,
  UserCheck,
  Users,
  X
} from "lucide-react";
import { toast } from "sonner";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UserAutocompleteMultiSelect } from "@/components/ui/user-autocomplete";
import { canRead, canWrite } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, getVisibleTasks, useVisualKanbanStore } from "@/lib/store";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { useShallow } from "zustand/react/shallow";

type TimeScale = "day" | "week" | "month" | "quarter";
type DragMode = "move" | "resize-start" | "resize-end";
type AssignmentViewMode = "all" | "assignee" | "assignee_or_participant";
type TreeDropPosition = "before" | "inside" | "after";

type TimelineColumn = {
  index: number;
  start: Date;
  end: Date;
  primary: string;
  secondary: string;
  isCurrent: boolean;
};

type RowBar = {
  left: number;
  width: number;
  clippedStart: boolean;
  clippedEnd: boolean;
};

type TimelineRow = {
  task: Task;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  participants: string[];
  start: Date;
  end: Date;
  color: string;
  explicitColor: boolean;
  bar: RowBar | null;
};

type DragState = {
  taskId: string;
  pointerId: number;
  mode: DragMode;
  originX: number;
  originY: number;
  originalStart: Date;
  originalEnd: Date;
};

type ColumnResizeState = {
  pointerId: number;
  originX: number;
  originWidth: number;
};

type TaskWithMeta = Task & {
  parentTaskId?: string;
  participantIds?: string[];
};

type ExtendedTaskPatch = Partial<Task> & {
  parentTaskId?: string | null;
  participantIds?: string[];
};

type DetailFormState = {
  title: string;
  description: string;
  participantIds: string[];
  visibility: Task["visibility"];
  startDate: string;
  endDate: string;
};

const DAY_MS = 86_400_000;
const colorTagPrefix = "color:";
const maxVisibleAvatars = 3;

const timeScaleMeta: Record<TimeScale, { label: string; columns: number; columnWidth: number }> = {
  day: { label: "일", columns: 28, columnWidth: 76 },
  week: { label: "주", columns: 16, columnWidth: 122 },
  month: { label: "월", columns: 12, columnWidth: 148 },
  quarter: { label: "분기", columns: 8, columnWidth: 172 }
};
const timelineColumnCountBounds = { min: 4, max: 48 } as const;
const defaultTaskColor = "#3b82f6";

const visibilityLabel: Record<Task["visibility"], string> = {
  shared: "공개",
  private: "개인"
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
    label: "모두 보기",
    shortLabel: "전체",
    icon: FolderKanban
  },
  assignee: {
    label: "담당자로 표기된 것만 보기",
    shortLabel: "담당",
    icon: UserCheck
  },
  assignee_or_participant: {
    label: "담당자 및 참여자로 표기된 것만 보기",
    shortLabel: "담당+참여",
    icon: Users
  }
};

const assignmentModeOrder: AssignmentViewMode[] = ["assignee", "assignee_or_participant", "all"];

const colorPalette = [
  "#3b82f6",
  "#2563eb",
  "#1d4ed8",
  "#1e40af",
  "#0ea5e9",
  "#06b6d4",
  "#0284c7",
  "#0369a1",
  "#8b5cf6",
  "#7c3aed",
  "#6d28d9",
  "#a855f7",
  "#ec4899",
  "#db2777",
  "#be185d",
  "#f97316",
  "#ea580c",
  "#f59e0b",
  "#d97706",
  "#ca8a04",
  "#f43f5e",
  "#ef4444",
  "#dc2626",
  "#84cc16",
  "#65a30d",
  "#14b8a6",
  "#0d9488",
  "#10b981",
  "#059669",
  "#22c55e",
  "#64748b"
] as const;

const neoCard =
  "rounded-2xl border-2 border-zinc-900 bg-white shadow-[4px_4px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[4px_4px_0_0_rgb(0,0,0)]";
const neoPanel =
  "rounded-xl border-2 border-zinc-900 bg-white shadow-[3px_3px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[3px_3px_0_0_rgb(0,0,0)]";
const neoControl =
  "border-2 border-zinc-900 shadow-[2px_2px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]";
const neoButton = `${neoControl} transition hover:-translate-y-0.5 hover:shadow-none`;

function readParam(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function safeDate(input?: string) {
  const parsed = input ? new Date(input) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function daySerial(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDiff(from: Date, to: Date) {
  return Math.round((daySerial(to) - daySerial(from)) / DAY_MS);
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(base: Date, months: number) {
  const source = new Date(base);
  const targetMonth = source.getMonth() + months;
  const targetYear = source.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const day = source.getDate();
  const maxDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  return new Date(targetYear, normalizedMonth, Math.min(day, maxDay));
}

function startOfWeek(date: Date) {
  const normalized = startOfDay(date);
  const day = normalized.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  normalized.setDate(normalized.getDate() + offset);
  return normalized;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfQuarter(date: Date) {
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterMonth, 1);
}

function addScaleUnits(base: Date, amount: number, scale: TimeScale) {
  switch (scale) {
    case "day":
      return addDays(base, amount);
    case "week":
      return addDays(base, amount * 7);
    case "month":
      return addMonths(base, amount);
    case "quarter":
      return addMonths(base, amount * 3);
    default:
      return addDays(base, amount);
  }
}

function alignDateToScale(date: Date, scale: TimeScale) {
  const normalized = startOfDay(date);
  switch (scale) {
    case "day":
      return normalized;
    case "week":
      return startOfWeek(normalized);
    case "month":
      return startOfMonth(normalized);
    case "quarter":
      return startOfQuarter(normalized);
    default:
      return normalized;
  }
}

function rangeForTask(task: Task) {
  const start = startOfDay(safeDate(task.startDate ?? task.updatedAt ?? task.dueDate));
  const end = startOfDay(safeDate(task.endDate ?? task.dueDate ?? task.startDate ?? task.updatedAt));
  if (daySerial(end) < daySerial(start)) {
    return { start: end, end: start };
  }
  return { start, end };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toDateInputValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(date);
}

function formatMonthLabel(date: Date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getIsoWeekInfo(date: Date) {
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (thursday.getDay() + 6) % 7;
  thursday.setDate(thursday.getDate() - day + 3);

  const isoYear = thursday.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);

  const week = Math.floor(dayDiff(firstThursday, thursday) / 7) + 1;
  return { year: isoYear, week };
}

function formatQuarterLabel(date: Date) {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()} Q${quarter}`;
}

function describeColumn(scale: TimeScale, start: Date, end: Date) {
  switch (scale) {
    case "day": {
      const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(start);
      return {
        primary: formatShortDate(start),
        secondary: weekday
      };
    }
    case "week": {
      const { year, week } = getIsoWeekInfo(start);
      return {
        primary: `${year}-W${String(week).padStart(2, "0")}`,
        secondary: `${formatShortDate(start)} ~ ${formatShortDate(end)}`
      };
    }
    case "month":
      return {
        primary: formatMonthLabel(start),
        secondary: `${start.getMonth() + 1}월`
      };
    case "quarter": {
      const quarter = Math.floor(start.getMonth() / 3) + 1;
      return {
        primary: formatQuarterLabel(start),
        secondary: `${quarter * 3 - 2}~${quarter * 3}월`
      };
    }
    default:
      return {
        primary: formatShortDate(start),
        secondary: formatShortDate(end)
      };
  }
}

function buildTimelineColumns(windowStart: Date, scale: TimeScale, count: number) {
  const todaySerial = daySerial(new Date());

  return Array.from({ length: count }, (_, index) => {
    const start = addScaleUnits(windowStart, index, scale);
    const nextStart = addScaleUnits(windowStart, index + 1, scale);
    const end = addDays(nextStart, -1);
    const label = describeColumn(scale, start, end);

    return {
      index,
      start,
      end,
      primary: label.primary,
      secondary: label.secondary,
      isCurrent: daySerial(start) <= todaySerial && todaySerial <= daySerial(end)
    } satisfies TimelineColumn;
  });
}

function readTaskParentId(task: Task) {
  const parentTaskId = (task as TaskWithMeta).parentTaskId;
  if (typeof parentTaskId !== "string") return null;
  const normalized = parentTaskId.trim();
  return normalized.length > 0 ? normalized : null;
}

function readTaskParticipantIds(task: Task) {
  const raw = (task as TaskWithMeta).participantIds;
  const participants = Array.isArray(raw) ? raw : [];
  const normalized = participants.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim());

  if (task.assigneeId && !normalized.includes(task.assigneeId)) {
    normalized.unshift(task.assigneeId);
  }

  return normalized;
}

function readExplicitTaskColor(task: Task) {
  const rawColor = task.tags.find((tag) => tag.startsWith(colorTagPrefix))?.slice(colorTagPrefix.length);
  if (rawColor && /^#[0-9a-fA-F]{6}$/.test(rawColor)) {
    return rawColor.toLowerCase();
  }
  return null;
}

function resolveTaskColor(task: Task, parentColor: string | null) {
  const explicit = readExplicitTaskColor(task);
  if (explicit) {
    return { color: explicit, explicitColor: true };
  }
  if (parentColor) {
    return { color: lightenHex(parentColor, 0.28), explicitColor: false };
  }
  return { color: defaultTaskColor, explicitColor: false };
}

function patchColorTag(tags: string[] | undefined, color: string) {
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : "#3b82f6";
  const cleanTags = (tags ?? []).filter((tag) => !tag.startsWith(colorTagPrefix));
  return [...cleanTags, `${colorTagPrefix}${safeColor}`];
}

function clearColorTag(tags: string[] | undefined) {
  return (tags ?? []).filter((tag) => !tag.startsWith(colorTagPrefix));
}

function lightenHex(hex: string, ratio: number) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return "#93c5fd";
  const channels = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
  const mixed = channels.map((channel) => Math.round(channel + (255 - channel) * clamp(ratio, 0, 1)));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function hexToArgb(hex: string) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return "FF3B82F6";
  }
  return `FF${normalized.toUpperCase()}`;
}

function getContrastTextArgb(hex: string) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return "FFFFFFFF";
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? "FF111827" : "FFFFFFFF";
}

function sanitizeFileName(input: string) {
  return input.replace(/[\\/:*?"<>|]/g, "_").trim() || "gantt";
}

function findVisibleSpan(start: Date, end: Date, columns: TimelineColumn[]) {
  let first = -1;
  let last = -1;

  for (const column of columns) {
    const overlaps = daySerial(end) >= daySerial(column.start) && daySerial(start) <= daySerial(column.end);
    if (!overlaps) continue;
    if (first === -1) first = column.index;
    last = column.index;
  }

  if (first === -1 || last === -1) return null;
  return { first, last };
}

function initials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function compareTaskOrder(a: Task, b: Task) {
  const aOrder = typeof a.order === "number" ? a.order : Number.POSITIVE_INFINITY;
  const bOrder = typeof b.order === "number" ? b.order : Number.POSITIVE_INFINITY;
  if (aOrder !== bOrder) return aOrder - bOrder;

  const aStart = rangeForTask(a).start;
  const bStart = rangeForTask(b).start;
  const byStart = daySerial(aStart) - daySerial(bStart);
  if (byStart !== 0) return byStart;
  return a.title.localeCompare(b.title, "ko");
}

function PopupShell({
  open,
  onClose,
  title,
  description,
  editableTitle,
  widthClassName = "max-w-4xl",
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
  const titleId = useId();
  const descriptionId = description ? `${titleId}-description` : undefined;
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label={`${title} 닫기`}
      />

      <div
        className={cn(`relative w-full ${neoCard}`, widthClassName)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="flex items-start gap-3 border-b-2 border-zinc-900 px-4 py-3 dark:border-zinc-100">
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
                className="h-10 w-full border-zinc-900 bg-white text-base font-semibold dark:border-zinc-100 dark:bg-zinc-900"
                aria-label="작업 제목"
              />
            ) : null}
            {description ? (
              <p id={descriptionId} className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {description}
              </p>
            ) : null}
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} className={cn(neoButton, "shrink-0")} aria-label={`${title} 닫기`}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div
          className="max-h-[78vh] overflow-auto p-4 [&_button]:border-2 [&_button]:border-zinc-900 [&_button]:shadow-[2px_2px_0_0_rgb(24,24,27)] [&_button]:transition [&_button:hover]:-translate-y-0.5 [&_button:hover]:shadow-none dark:[&_button]:border-zinc-100 dark:[&_button]:shadow-[2px_2px_0_0_rgb(0,0,0)] [&_input]:border-2 [&_input]:border-zinc-900 [&_input]:shadow-[2px_2px_0_0_rgb(24,24,27)] dark:[&_input]:border-zinc-100 dark:[&_input]:shadow-[2px_2px_0_0_rgb(0,0,0)] [&_select]:border-2 [&_select]:border-zinc-900 [&_select]:shadow-[2px_2px_0_0_rgb(24,24,27)] dark:[&_select]:border-zinc-100 dark:[&_select]:shadow-[2px_2px_0_0_rgb(0,0,0)] [&_textarea]:border-2 [&_textarea]:border-zinc-900 [&_textarea]:shadow-[2px_2px_0_0_rgb(24,24,27)] dark:[&_textarea]:border-zinc-100 dark:[&_textarea]:shadow-[2px_2px_0_0_rgb(0,0,0)]"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default function GanttPage() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = readParam(params.projectId);

  const [searchQuery, setSearchQuery] = useState("");
  const [assignmentViewMode, setAssignmentViewMode] = useState<AssignmentViewMode>("all");
  const [highlightMyAssignments, setHighlightMyAssignments] = useState(false);
  const [timeScale, setTimeScale] = useState<TimeScale>("week");
  const [columnCountByScale, setColumnCountByScale] = useState<Record<TimeScale, number>>(() => ({
    day: timeScaleMeta.day.columns,
    week: timeScaleMeta.week.columns,
    month: timeScaleMeta.month.columns,
    quarter: timeScaleMeta.quarter.columns
  }));
  const [windowStart, setWindowStart] = useState<Date>(() => startOfWeek(new Date()));
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [treeDragTaskId, setTreeDragTaskId] = useState<string | null>(null);
  const [treeDropTarget, setTreeDropTarget] = useState<{ taskId: string; position: TreeDropPosition } | null>(null);
  const [columnResizeState, setColumnResizeState] = useState<ColumnResizeState | null>(null);
  const [leftColumnWidth, setLeftColumnWidth] = useState(430);
  const [searchPopupOpen, setSearchPopupOpen] = useState(false);
  const [addPopupOpen, setAddPopupOpen] = useState(false);
  const [projectPopupOpen, setProjectPopupOpen] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [detailForm, setDetailForm] = useState<DetailFormState | null>(null);
  const dragDeltaRef = useRef(0);
  const barDragIntentRef = useRef<"pending" | "timeline" | "tree">("pending");

  const [newTaskForm, setNewTaskForm] = useState(() => ({
    title: "",
    description: "",
    participantIds: [] as string[],
    startDate: toDateInputValue(new Date()),
    endDate: toDateInputValue(addDays(new Date(), 13)),
    visibility: "shared" as Task["visibility"],
    colorMode: "manual" as "auto" | "manual",
    color: "#3b82f6"
  }));

  const [newProjectForm, setNewProjectForm] = useState(() => ({
    name: "",
    description: ""
  }));

  const { users, currentUserId, projects, projectMemberships, permissions, tasks, addProject, addTask, updateTask, removeTask } = useVisualKanbanStore(
    useShallow((state) => ({
      users: state.users,
      currentUserId: state.currentUserId,
      projects: state.projects,
      projectMemberships: state.projectMemberships,
      permissions: state.permissions,
      tasks: state.tasks,
      addProject: state.addProject,
      addTask: state.addTask,
      updateTask: state.updateTask,
      removeTask: state.removeTask
    }))
  );

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);

  const ganttRole = useMemo(
    () =>
      getEffectiveRoleForFeature({
        user: currentUser,
        projectId,
        feature: "gantt",
        permissions,
        projectMemberships,
        projects
      }),
    [currentUser, permissions, projectId, projectMemberships, projects]
  );

  const writable = canWrite(ganttRole);

  const project = useMemo(() => projects.find((item) => item.id === projectId) ?? null, [projectId, projects]);

  const projectTasks = useMemo(() => {
    const inProject = tasks.filter((task) => task.projectId === projectId);
    return getVisibleTasks({ tasks: inProject, user: currentUser, role: ganttRole });
  }, [currentUser, ganttRole, projectId, tasks]);

  const projectTaskById = useMemo(() => new Map(projectTasks.map((task) => [task.id, task])), [projectTasks]);
  const childIdsByParentId = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const task of projectTasks) {
      const parentId = readTaskParentId(task);
      if (!parentId) continue;
      const siblings = map.get(parentId);
      if (siblings) {
        siblings.push(task.id);
      } else {
        map.set(parentId, [task.id]);
      }
    }

    return map;
  }, [projectTasks]);

  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const userAutocompleteOptions = useMemo(
    () =>
      users.map((user) => ({
        id: user.id,
        label: user.displayName,
        secondaryLabel: `@${user.username}`
      })),
    [users]
  );

  const isAssignedToCurrentUser = (task: Task, participants?: string[]) => {
    if (!currentUserId) return false;
    const normalizedParticipants = participants ?? readTaskParticipantIds(task);
    return task.assigneeId === currentUserId || normalizedParticipants.includes(currentUserId);
  };

  const filteredBaseTasks = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();

    return projectTasks
      .filter((task) => {
        if (!currentUserId || assignmentViewMode === "all") return true;
        const participants = readTaskParticipantIds(task);
        if (assignmentViewMode === "assignee") {
          return task.assigneeId === currentUserId;
        }
        return task.assigneeId === currentUserId || participants.includes(currentUserId);
      })
      .filter((task) => {
        if (!needle) return true;

        const participantNames = readTaskParticipantIds(task)
          .map((id) => (userMap.get(id)?.displayName ?? id).toLowerCase())
          .join(" ");

        return (
          task.title.toLowerCase().includes(needle) ||
          task.description.toLowerCase().includes(needle) ||
          participantNames.includes(needle)
        );
      });
  }, [assignmentViewMode, currentUserId, projectTasks, searchQuery, userMap]);

  const scopedTaskIds = useMemo(() => {
    const scoped = new Set(filteredBaseTasks.map((task) => task.id));

    for (const task of filteredBaseTasks) {
      const visited = new Set<string>();
      let parentId = readTaskParentId(task);

      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = projectTaskById.get(parentId);
        if (!parent) break;
        scoped.add(parent.id);
        parentId = readTaskParentId(parent);
      }
    }

    return scoped;
  }, [filteredBaseTasks, projectTaskById]);

  const scopedTasks = useMemo(() => projectTasks.filter((task) => scopedTaskIds.has(task.id)), [projectTasks, scopedTaskIds]);

  const scale = timeScaleMeta[timeScale];
  const timelineColumnCount = clamp(columnCountByScale[timeScale] ?? scale.columns, timelineColumnCountBounds.min, timelineColumnCountBounds.max);
  const rowHeight = 58;
  const timelineWidth = scale.columnWidth * timelineColumnCount;

  const columns = useMemo(
    () => buildTimelineColumns(windowStart, timeScale, timelineColumnCount),
    [timeScale, timelineColumnCount, windowStart]
  );

  const timelineRows = useMemo(() => {
    const taskMap = new Map(scopedTasks.map((task) => [task.id, task]));
    const childrenMap = new Map<string, Task[]>();
    const roots: Task[] = [];

    for (const task of scopedTasks) {
      const parentId = readTaskParentId(task);
      if (parentId && parentId !== task.id && taskMap.has(parentId)) {
        const siblings = childrenMap.get(parentId);
        if (siblings) {
          siblings.push(task);
        } else {
          childrenMap.set(parentId, [task]);
        }
      } else {
        roots.push(task);
      }
    }

    roots.sort(compareTaskOrder);
    for (const siblings of childrenMap.values()) {
      siblings.sort(compareTaskOrder);
    }

    const rows: TimelineRow[] = [];
    const path = new Set<string>();

    const traverse = (task: Task, depth: number, parentColor: string | null, hiddenByCollapse: boolean) => {
      if (path.has(task.id)) return;
      path.add(task.id);

      const children = childrenMap.get(task.id) ?? [];
      const hasChildren = children.length > 0;
      const collapsed = collapsedIds.has(task.id);
      const participants = readTaskParticipantIds(task);
      const { start, end } = rangeForTask(task);
      const colorInfo = resolveTaskColor(task, parentColor);

      if (!hiddenByCollapse) {
        const visibleSpan = findVisibleSpan(start, end, columns);
        const bar: RowBar | null = visibleSpan
          ? {
              left: visibleSpan.first * scale.columnWidth + 6,
              width: Math.max(18, (visibleSpan.last - visibleSpan.first + 1) * scale.columnWidth - 12),
              clippedStart: daySerial(start) < daySerial(columns[0]?.start ?? start),
              clippedEnd: daySerial(end) > daySerial(columns[columns.length - 1]?.end ?? end)
            }
          : null;

        rows.push({
          task,
          depth,
          hasChildren,
          collapsed,
          participants,
          start,
          end,
          color: colorInfo.color,
          explicitColor: colorInfo.explicitColor,
          bar
        });
      }

      const nextHidden = hiddenByCollapse || collapsed;
      for (const child of children) {
        traverse(child, depth + 1, colorInfo.color, nextHidden);
      }

      path.delete(task.id);
    };

    for (const root of roots) {
      traverse(root, 0, null, false);
    }

    return rows;
  }, [collapsedIds, columns, scale.columnWidth, scopedTasks]);

  const detailTask = useMemo(() => (detailTaskId ? projectTaskById.get(detailTaskId) ?? null : null), [detailTaskId, projectTaskById]);
  const detailRow = useMemo(() => timelineRows.find((row) => row.task.id === detailTaskId) ?? null, [detailTaskId, timelineRows]);

  const closeDetailPopup = () => {
    setDetailTaskId(null);
    setDetailForm(null);
  };

  const openDetailPopup = (taskId: string) => {
    const targetTask = projectTaskById.get(taskId);
    if (!targetTask) return;
    const { start, end } = rangeForTask(targetTask);

    setDetailTaskId(taskId);
    setDetailForm({
      title: targetTask.title,
      description: targetTask.description,
      participantIds: readTaskParticipantIds(targetTask),
      visibility: targetTask.visibility,
      startDate: toDateInputValue(start),
      endDate: toDateInputValue(end)
    });
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (detailTaskId) {
        closeDetailPopup();
        return;
      }
      if (projectPopupOpen) {
        setProjectPopupOpen(false);
        return;
      }
      if (addPopupOpen) {
        setAddPopupOpen(false);
        return;
      }
      if (searchPopupOpen) {
        setSearchPopupOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [addPopupOpen, detailTaskId, projectPopupOpen, searchPopupOpen]);

  const setScaleFromToolbar = (scaleKey: TimeScale) => {
    setTimeScale(scaleKey);
    if (scaleKey === "day" || scaleKey === "week") {
      setWindowStart(startOfWeek(new Date()));
      return;
    }
    setWindowStart((prev) => alignDateToScale(prev, scaleKey));
  };

  const shiftWindow = (amount: number) => {
    setWindowStart((prev) => alignDateToScale(addScaleUnits(prev, amount, timeScale), timeScale));
  };

  const updateTimelineColumnCount = (scaleKey: TimeScale, value: number) => {
    if (!Number.isFinite(value)) return;
    const normalized = clamp(Math.round(value), timelineColumnCountBounds.min, timelineColumnCountBounds.max);
    setColumnCountByScale((prev) => {
      if (prev[scaleKey] === normalized) return prev;
      return {
        ...prev,
        [scaleKey]: normalized
      };
    });
  };

  const cycleAssignmentViewMode = () => {
    setAssignmentViewMode((prev) => {
      const currentIndex = assignmentModeOrder.indexOf(prev);
      const nextMode = assignmentModeOrder[(currentIndex + 1) % assignmentModeOrder.length] ?? "all";
      return nextMode;
    });
  };

  const jumpToToday = () => {
    const today = new Date();
    if (timeScale === "day" || timeScale === "week") {
      setWindowStart(startOfWeek(today));
      return;
    }
    setWindowStart(alignDateToScale(today, timeScale));
  };

  const clearFilters = () => {
    setSearchQuery("");
    setAssignmentViewMode("all");
  };

  const handleExportExcel = async () => {
    if (isExportingExcel) return;
    if (!project) {
      toast.error("프로젝트 정보를 찾을 수 없습니다.");
      return;
    }
    setIsExportingExcel(true);

    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "VisualKanban";
      workbook.lastModifiedBy = currentUser?.displayName ?? "VisualKanban";
      workbook.created = new Date();
      workbook.modified = new Date();

      const exportRows = timelineRows;

      const dataSheet = workbook.addWorksheet("TaskData", {
        views: [{ state: "frozen", ySplit: 1 }]
      });

      dataSheet.addRow([
        "No",
        "Task ID",
        "Title",
        "Description",
        "Project",
        "Participants",
        "Visibility",
        "Start Date",
        "End Date",
        "Duration(days)",
        "Parent Task",
        "Depth",
        "Color"
      ]);

      dataSheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FF111827" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE5E7EB" }
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFD1D5DB" } },
          left: { style: "thin", color: { argb: "FFD1D5DB" } },
          bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
          right: { style: "thin", color: { argb: "FFD1D5DB" } }
        };
      });

      exportRows.forEach((row, index) => {
        const parentId = readTaskParentId(row.task);
        const parentTitle = parentId ? projectTaskById.get(parentId)?.title ?? parentId : "";
        const participantNames = row.participants.map((id) => userMap.get(id)?.displayName ?? id).join(", ");
        const duration = dayDiff(row.start, row.end) + 1;

        const added = dataSheet.addRow([
          index + 1,
          row.task.id,
          `${"  ".repeat(row.depth)}${row.task.title}`,
          row.task.description,
          project.name,
          participantNames,
          visibilityLabel[row.task.visibility],
          toDateInputValue(row.start),
          toDateInputValue(row.end),
          duration,
          parentTitle,
          row.depth,
          row.color.toUpperCase()
        ]);

        const isHighlighted = highlightMyAssignments && isAssignedToCurrentUser(row.task, row.participants);
        if (isHighlighted) {
          added.eachCell((cell) => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFE0F2FE" }
            };
          });
        }

        added.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFE5E7EB" } },
            left: { style: "thin", color: { argb: "FFE5E7EB" } },
            bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
            right: { style: "thin", color: { argb: "FFE5E7EB" } }
          };
          cell.alignment = { vertical: "middle", horizontal: "left" };
        });
      });

      dataSheet.columns = [
        { width: 6 },
        { width: 22 },
        { width: 30 },
        { width: 38 },
        { width: 20 },
        { width: 30 },
        { width: 12 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 24 },
        { width: 8 },
        { width: 12 }
      ];

      const graphSheet = workbook.addWorksheet("GanttGraph", {
        views: [{ state: "frozen", xSplit: 3, ySplit: 4 }]
      });

      graphSheet.getCell("A1").value = `${project.name} Gantt Export`;
      graphSheet.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF111827" } };
      graphSheet.mergeCells(1, 1, 1, Math.max(4, columns.length + 3));

      graphSheet.getCell("A2").value = `Exported At: ${new Date().toLocaleString("ko-KR")}`;
      graphSheet.getCell("A2").font = { size: 10, color: { argb: "FF4B5563" } };
      graphSheet.mergeCells(2, 1, 2, Math.max(4, columns.length + 3));

      const headerRowIndex = 4;
      const headerRow = graphSheet.getRow(headerRowIndex);
      headerRow.getCell(1).value = "Task";
      headerRow.getCell(2).value = "Participants";
      columns.forEach((column, index) => {
        headerRow.getCell(3 + index).value = column.primary;
      });

      headerRow.eachCell((cell) => {
        cell.font = { bold: true, size: 10, color: { argb: "FF111827" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE5E7EB" }
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFD1D5DB" } },
          left: { style: "thin", color: { argb: "FFD1D5DB" } },
          bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
          right: { style: "thin", color: { argb: "FFD1D5DB" } }
        };
      });
      headerRow.height = 20;

      graphSheet.getColumn(1).width = Math.max(24, Math.floor(leftColumnWidth / 14));
      graphSheet.getColumn(2).width = 24;
      columns.forEach((_, index) => {
        graphSheet.getColumn(3 + index).width = timeScale === "day" ? 4.3 : 5.4;
      });

      exportRows.forEach((row, rowIndex) => {
        const excelRowIndex = headerRowIndex + 1 + rowIndex;
        const excelRow = graphSheet.getRow(excelRowIndex);
        const participantNames = row.participants.map((id) => userMap.get(id)?.displayName ?? id).join(", ");

        excelRow.getCell(1).value = `${"   ".repeat(row.depth)}${row.task.title}`;
        excelRow.getCell(2).value = participantNames;

        const isHighlighted = highlightMyAssignments && isAssignedToCurrentUser(row.task, row.participants);
        if (isHighlighted) {
          for (let colIdx = 1; colIdx <= Math.max(2, columns.length + 2); colIdx += 1) {
            const cell = excelRow.getCell(colIdx);
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF0F9FF" }
            };
          }
        }

        let firstBarCellPlaced = false;
        columns.forEach((column, columnIndex) => {
          const cell = excelRow.getCell(3 + columnIndex);
          const overlaps = daySerial(row.end) >= daySerial(column.start) && daySerial(row.start) <= daySerial(column.end);

          cell.border = {
            top: { style: "thin", color: { argb: "FFE5E7EB" } },
            left: { style: "thin", color: { argb: "FFE5E7EB" } },
            bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
            right: { style: "thin", color: { argb: "FFE5E7EB" } }
          };

          if (!overlaps) return;

          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: hexToArgb(row.color) }
          };
          cell.font = {
            size: 9,
            bold: true,
            color: { argb: getContrastTextArgb(row.color) }
          };
          cell.alignment = { vertical: "middle", horizontal: "center" };

          if (!firstBarCellPlaced) {
            cell.value = row.task.title.length > 10 ? `${row.task.title.slice(0, 10)}…` : row.task.title;
            firstBarCellPlaced = true;
          }
        });

        excelRow.height = 19;
      });

      if (exportRows.length === 0) {
        const emptyRowIndex = headerRowIndex + 1;
        graphSheet.mergeCells(emptyRowIndex, 1, emptyRowIndex, Math.max(4, columns.length + 3));
        const emptyCell = graphSheet.getCell(emptyRowIndex, 1);
        emptyCell.value = "표시된 테스크 항목이 없습니다.";
        emptyCell.alignment = { horizontal: "center", vertical: "middle" };
        emptyCell.font = { size: 11, color: { argb: "FF6B7280" } };
      }

      const fileName = `${sanitizeFileName(project.name)}-gantt-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.URL.revokeObjectURL(url);

      toast.success(`엑셀 파일로 저장되었습니다. (${fileName})`);
    } catch (error) {
      console.error(error);
      toast.error("엑셀 저장 중 오류가 발생했습니다.");
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleSelectProject = (nextProjectId: string) => {
    if (!nextProjectId) return;
    if (nextProjectId === projectId) {
      setProjectPopupOpen(false);
      return;
    }
    router.push(`/app/projects/${nextProjectId}/gantt`);
    setProjectPopupOpen(false);
    toast.success("프로젝트를 변경했습니다.");
  };

  const handleCreateProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!writable) {
      toast.warning("읽기 전용 권한에서는 프로젝트를 추가할 수 없습니다.");
      return;
    }

    const name = newProjectForm.name.trim();
    if (!name) {
      toast.error("프로젝트명을 입력해 주세요.");
      return;
    }

    const result = addProject({
      name,
      description: newProjectForm.description.trim()
    });

    if (!result.ok || !result.projectId) {
      toast.error(result.reason ?? "프로젝트 추가에 실패했습니다.");
      return;
    }

    setNewProjectForm({ name: "", description: "" });
    setProjectPopupOpen(false);
    router.push(`/app/projects/${result.projectId}/gantt`);
    toast.success(`"${name}" 프로젝트를 추가했습니다.`);
  };

  const handleDetailSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!detailTask || !detailForm) return;
    if (!writable) {
      toast.warning("읽기 전용 권한에서는 상세 정보를 수정할 수 없습니다.");
      return;
    }

    const title = detailForm.title.trim();
    if (!title) {
      toast.error("작업명을 입력해 주세요.");
      return;
    }

    const participantIds = [...new Set(detailForm.participantIds.map((id) => id.trim()).filter(Boolean))];
    const assigneeId = participantIds[0] ?? detailTask.assigneeId ?? currentUserId ?? users[0]?.id;
    if (!assigneeId) {
      toast.error("참여자를 최소 1명 이상 선택해 주세요.");
      return;
    }

    if (!participantIds.includes(assigneeId)) {
      participantIds.unshift(assigneeId);
    }

    const ownerId = detailTask.ownerId || assigneeId;

    const startDate = parseDateInput(detailForm.startDate);
    const endDate = parseDateInput(detailForm.endDate);
    if (!startDate || !endDate) {
      toast.error("시작일과 종료일을 올바르게 입력해 주세요.");
      return;
    }

    if (daySerial(endDate) < daySerial(startDate)) {
      toast.error("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    updateTask(detailTask.id, {
      title,
      description: detailForm.description,
      assigneeId,
      ownerId,
      participantIds,
      visibility: detailForm.visibility,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      dueDate: endDate.toISOString()
    });

    setDetailForm((prev) =>
      prev
        ? {
            ...prev,
            title,
            participantIds,
            startDate: toDateInputValue(startDate),
            endDate: toDateInputValue(endDate)
          }
        : prev
    );

    toast.success(`"${title}" 상세 정보가 저장되었습니다.`);
  };

  const toggleCollapse = (taskId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const getSortedSiblingIds = (parentId: string | null) =>
    projectTasks
      .filter((candidate) => readTaskParentId(candidate) === parentId)
      .sort(compareTaskOrder)
      .map((candidate) => candidate.id);

  const commitSiblingOrder = (patches: Map<string, ExtendedTaskPatch>, parentId: string | null, siblingIds: string[]) => {
    siblingIds.forEach((siblingId, index) => {
      const task = projectTaskById.get(siblingId);
      if (!task) return;

      const currentParentId = readTaskParentId(task);
      const currentOrder = typeof task.order === "number" ? task.order : Number.POSITIVE_INFINITY;
      const nextParentId = parentId ?? undefined;

      if (currentParentId === parentId && currentOrder === index) return;

      const previous = patches.get(siblingId) ?? {};
      patches.set(siblingId, {
        ...previous,
        parentTaskId: nextParentId,
        order: index
      });
    });
  };

  const applyTreePatches = (patches: Map<string, ExtendedTaskPatch>) => {
    if (patches.size === 0) return false;
    patches.forEach((patch, taskId) => {
      updateTask(taskId, patch as Partial<Task>);
    });
    return true;
  };

  const collectSubtreeTaskIds = (rootTaskId: string) => {
    const queue = [rootTaskId];
    const collected = new Set<string>();

    while (queue.length > 0) {
      const currentTaskId = queue.shift();
      if (!currentTaskId || collected.has(currentTaskId)) continue;
      collected.add(currentTaskId);

      const children = childIdsByParentId.get(currentTaskId) ?? [];
      for (const childTaskId of children) {
        queue.push(childTaskId);
      }
    }

    return collected;
  };

  const isValidTreeDrop = (draggedTaskId: string, targetTaskId: string, position: TreeDropPosition) => {
    if (!draggedTaskId || !targetTaskId) return false;
    if (draggedTaskId === targetTaskId) return false;

    const targetTask = projectTaskById.get(targetTaskId);
    if (!targetTask) return false;
    const subtreeTaskIds = collectSubtreeTaskIds(draggedTaskId);

    if (position === "inside") {
      if (subtreeTaskIds.has(targetTaskId)) {
        return false;
      }
    }

    const destinationParentId = position === "inside" ? targetTaskId : readTaskParentId(targetTask);
    if (destinationParentId && subtreeTaskIds.has(destinationParentId)) {
      return false;
    }

    return true;
  };

  const resolveTreeDropPosition = (event: ReactDragEvent<HTMLDivElement>): TreeDropPosition => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeY = event.clientY - rect.top;
    const ratio = rect.height > 0 ? relativeY / rect.height : 0.5;

    if (ratio < 0.25) return "before";
    if (ratio > 0.75) return "after";
    return "inside";
  };

  const applyTreeReorder = (draggedTaskId: string, targetTaskId: string, position: TreeDropPosition) => {
    const draggedTask = projectTaskById.get(draggedTaskId);
    const targetTask = projectTaskById.get(targetTaskId);

    if (!draggedTask || !targetTask) return false;
    if (!isValidTreeDrop(draggedTaskId, targetTaskId, position)) return false;

    const draggedParentId = readTaskParentId(draggedTask);
    const targetParentId = readTaskParentId(targetTask);
    const patches = new Map<string, ExtendedTaskPatch>();

    if (position === "inside") {
      const previousSiblings = getSortedSiblingIds(draggedParentId).filter((taskId) => taskId !== draggedTaskId);
      const nextChildren = [...getSortedSiblingIds(targetTaskId).filter((taskId) => taskId !== draggedTaskId), draggedTaskId];

      commitSiblingOrder(patches, draggedParentId, previousSiblings);
      commitSiblingOrder(patches, targetTaskId, nextChildren);

      if (!applyTreePatches(patches)) return false;

      setCollapsedIds((prev) => {
        if (!prev.has(targetTaskId)) return prev;
        const next = new Set(prev);
        next.delete(targetTaskId);
        return next;
      });

      toast.success(`"${draggedTask.title}" 작업을 "${targetTask.title}" 하위로 이동했습니다.`);
      return true;
    }

    const destinationParentId = targetParentId;
    const destinationSiblings = getSortedSiblingIds(destinationParentId).filter((taskId) => taskId !== draggedTaskId);
    const targetIndex = destinationSiblings.indexOf(targetTaskId);
    if (targetIndex < 0) return false;

    const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
    destinationSiblings.splice(insertIndex, 0, draggedTaskId);

    if (draggedParentId !== destinationParentId) {
      const previousSiblings = getSortedSiblingIds(draggedParentId).filter((taskId) => taskId !== draggedTaskId);
      commitSiblingOrder(patches, draggedParentId, previousSiblings);
    }

    commitSiblingOrder(patches, destinationParentId, destinationSiblings);

    if (!applyTreePatches(patches)) return false;

    toast.success(`"${draggedTask.title}" 작업 순서를 변경했습니다.`);
    return true;
  };

  const isValidTreeDropRef = useRef(isValidTreeDrop);
  const applyTreeReorderRef = useRef(applyTreeReorder);
  isValidTreeDropRef.current = isValidTreeDrop;
  applyTreeReorderRef.current = applyTreeReorder;

  const handleTreeDragStart = (event: ReactDragEvent<HTMLElement>, task: Task) => {
    if (!writable) {
      event.preventDefault();
      return;
    }

    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
    setTreeDragTaskId(task.id);
    setTreeDropTarget(null);
  };

  const handleTreeDragOver = (event: ReactDragEvent<HTMLDivElement>, targetTask: Task) => {
    if (!writable || !treeDragTaskId) return;

    event.preventDefault();
    event.stopPropagation();

    const position = resolveTreeDropPosition(event);
    if (!isValidTreeDrop(treeDragTaskId, targetTask.id, position)) {
      event.dataTransfer.dropEffect = "none";
      if (treeDropTarget) {
        setTreeDropTarget(null);
      }
      return;
    }

    event.dataTransfer.dropEffect = "move";
    if (!treeDropTarget || treeDropTarget.taskId !== targetTask.id || treeDropTarget.position !== position) {
      setTreeDropTarget({ taskId: targetTask.id, position });
    }
  };

  const handleTreeDrop = (event: ReactDragEvent<HTMLDivElement>, targetTask: Task) => {
    if (!writable || !treeDragTaskId) return;

    event.preventDefault();
    event.stopPropagation();

    const position = resolveTreeDropPosition(event);
    const reordered = applyTreeReorder(treeDragTaskId, targetTask.id, position);
    if (!reordered) {
      toast.warning("트리 이동을 적용할 수 없습니다.");
    }

    setTreeDropTarget(null);
    setTreeDragTaskId(null);
  };

  const handleTreeDragEnd = () => {
    setTreeDropTarget(null);
    setTreeDragTaskId(null);
  };

  const handleCreateTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!writable) {
      toast.warning("읽기 전용 권한입니다. 작업 추가는 Editor 이상에서 가능합니다.");
      return;
    }

    const title = newTaskForm.title.trim();
    if (!title) {
      toast.error("작업명을 입력해 주세요.");
      return;
    }

    const participantIds = [...new Set(newTaskForm.participantIds.map((id) => id.trim()).filter(Boolean))];
    const assigneeId = participantIds[0] ?? currentUserId ?? users[0]?.id;
    if (!assigneeId) {
      toast.error("참여자를 최소 1명 이상 선택해 주세요.");
      return;
    }
    if (!participantIds.includes(assigneeId)) {
      participantIds.unshift(assigneeId);
    }
    const ownerId = currentUserId ?? assigneeId;

    const startDate = parseDateInput(newTaskForm.startDate);
    const endDate = parseDateInput(newTaskForm.endDate);
    if (!startDate || !endDate) {
      toast.error("시작일과 종료일을 올바르게 입력해 주세요.");
      return;
    }
    if (daySerial(endDate) < daySerial(startDate)) {
      toast.error("종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    const prevTaskIds = new Set(tasks.map((task) => task.id));

    addTask({
      projectId,
      title,
      description: newTaskForm.description.trim(),
      priority: "medium",
      assigneeId,
      dueDate: endDate.toISOString(),
      visibility: newTaskForm.visibility
    });

    const createdTask = useVisualKanbanStore
      .getState()
      .tasks.find((task) => task.projectId === projectId && !prevTaskIds.has(task.id));

    if (!createdTask) {
      toast.error("작업 생성 직후 대상을 찾지 못했습니다. 다시 시도해 주세요.");
      return;
    }

    const patch: ExtendedTaskPatch = {
      status: "in_progress",
      assigneeId,
      ownerId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      dueDate: endDate.toISOString(),
      visibility: newTaskForm.visibility,
      participantIds
    };

    if (newTaskForm.colorMode === "manual") {
      patch.tags = patchColorTag(createdTask.tags, newTaskForm.color);
    } else {
      patch.tags = clearColorTag(createdTask.tags);
    }

    updateTask(createdTask.id, patch as Partial<Task>);

    setWindowStart((prev) => {
      if (daySerial(startDate) < daySerial(prev)) {
        return alignDateToScale(startDate, timeScale);
      }
      return prev;
    });

    toast.success(`"${title}" 작업이 추가되었습니다.`);

    setNewTaskForm((prev) => ({
      ...prev,
      title: "",
      description: "",
      participantIds: [assigneeId],
      startDate: toDateInputValue(startDate),
      endDate: toDateInputValue(endDate)
    }));

    setAddPopupOpen(false);
  };

  const handleQuickAddChild = (task: Task, start: Date, end: Date) => {
    if (!writable) {
      toast.warning("읽기 전용 권한에서는 하위 작업을 만들 수 없습니다.");
      return;
    }

    const assigneeId = task.assigneeId || currentUserId || users[0]?.id;
    if (!assigneeId) {
      toast.error("담당자를 선택할 수 없습니다.");
      return;
    }

    const title = `${task.title} - 하위 작업`;
    const startDate = start;
    const defaultDuration = Math.max(3, Math.min(14, dayDiff(start, end) + 1));
    const endDate = addDays(startDate, defaultDuration - 1);

    const prevTaskIds = new Set(tasks.map((item) => item.id));

    addTask({
      projectId,
      title,
      description: `${task.title}의 하위 작업`,
      priority: task.priority,
      assigneeId,
      dueDate: endDate.toISOString(),
      visibility: task.visibility
    });

    const createdTask = useVisualKanbanStore
      .getState()
      .tasks.find((item) => item.projectId === projectId && !prevTaskIds.has(item.id));

    if (!createdTask) {
      toast.error("하위 작업 생성에 실패했습니다. 다시 시도해 주세요.");
      return;
    }

    const patch: ExtendedTaskPatch = {
      status: "in_progress",
      assigneeId,
      ownerId: task.ownerId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      dueDate: endDate.toISOString(),
      visibility: task.visibility,
      parentTaskId: task.id,
      participantIds: readTaskParticipantIds(task)
    };

    updateTask(createdTask.id, patch as Partial<Task>);

    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.delete(task.id);
      return next;
    });

    toast.success(`"${task.title}" 아래 하위 작업이 추가되었습니다.`);
  };

  const handleRemoveTask = (task: Task) => {
    if (!writable) {
      toast.warning("읽기 전용 권한에서는 작업을 삭제할 수 없습니다.");
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`"${task.title}" 작업을 삭제할까요? 하위 작업도 함께 삭제됩니다.`);
      if (!confirmed) return;
    }

    const result = removeTask(task.id);
    if (!result.ok) {
      toast.error(result.reason ?? "작업 삭제에 실패했습니다.");
      return;
    }

    const removalIds = new Set(result.removedTaskIds ?? [task.id]);

    setCollapsedIds((prev) => {
      const next = new Set(prev);
      for (const id of removalIds) {
        next.delete(id);
      }
      return next;
    });

    setDetailTaskId((prev) => {
      if (prev && removalIds.has(prev)) {
        setDetailForm(null);
        return null;
      }
      return prev;
    });

    toast.success(
      removalIds.size > 1 ? `"${task.title}" 및 하위 ${removalIds.size - 1}개 작업을 삭제했습니다.` : `"${task.title}" 작업을 삭제했습니다.`
    );
  };

  const handleRowColor = (task: Task, color: string) => {
    if (!writable) return;
    updateTask(task.id, { tags: patchColorTag(task.tags, color) });
  };

  const handleAutoColor = (task: Task) => {
    if (!writable) return;
    updateTask(task.id, { tags: clearColorTag(task.tags) });
  };

  const beginBarInteraction = (event: ReactPointerEvent<HTMLDivElement>, row: TimelineRow, mode: DragMode) => {
    if (!writable || !row.bar) return;
    event.preventDefault();
    event.stopPropagation();

    dragDeltaRef.current = 0;
    barDragIntentRef.current = mode === "move" ? "pending" : "timeline";
    if (mode === "move") {
      setTreeDropTarget(null);
    }
    setDragState({
      taskId: row.task.id,
      pointerId: event.pointerId,
      mode,
      originX: event.clientX,
      originY: event.clientY,
      originalStart: row.start,
      originalEnd: row.end
    });
  };

  const beginColumnResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setColumnResizeState({
      pointerId: event.pointerId,
      originX: event.clientX,
      originWidth: leftColumnWidth
    });
  };

  useEffect(() => {
    if (!dragState || !writable) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;

      if (dragState.mode === "move" && barDragIntentRef.current === "pending") {
        const deltaX = event.clientX - dragState.originX;
        const deltaY = event.clientY - dragState.originY;
        if (Math.abs(deltaX) >= 8 || Math.abs(deltaY) >= 8) {
          barDragIntentRef.current = Math.abs(deltaY) > Math.abs(deltaX) + 4 ? "tree" : "timeline";
        } else {
          return;
        }
      }

      if (dragState.mode === "move" && barDragIntentRef.current === "tree") {
        const pointedElement = document.elementFromPoint(event.clientX, event.clientY);
        const rowElement = pointedElement?.closest?.("[data-tree-row-task-id]") as HTMLElement | null;

        if (!rowElement) {
          setTreeDropTarget((previous) => (previous ? null : previous));
          return;
        }

        const targetTaskId = rowElement.dataset.treeRowTaskId;
        if (!targetTaskId) {
          setTreeDropTarget((previous) => (previous ? null : previous));
          return;
        }

        const rect = rowElement.getBoundingClientRect();
        const relativeY = event.clientY - rect.top;
        const ratio = rect.height > 0 ? relativeY / rect.height : 0.5;
        const position: TreeDropPosition = ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";

        if (!isValidTreeDropRef.current(dragState.taskId, targetTaskId, position)) {
          setTreeDropTarget((previous) => (previous ? null : previous));
          return;
        }

        setTreeDropTarget((previous) => {
          if (previous && previous.taskId === targetTaskId && previous.position === position) {
            return previous;
          }
          return { taskId: targetTaskId, position };
        });

        return;
      }

      const delta = Math.round((event.clientX - dragState.originX) / scale.columnWidth);
      if (delta === dragDeltaRef.current) return;
      dragDeltaRef.current = delta;

      let nextStart = dragState.originalStart;
      let nextEnd = dragState.originalEnd;

      if (dragState.mode === "move") {
        nextStart = addScaleUnits(dragState.originalStart, delta, timeScale);
        nextEnd = addScaleUnits(dragState.originalEnd, delta, timeScale);
      }

      if (dragState.mode === "resize-start") {
        const candidateStart = addScaleUnits(dragState.originalStart, delta, timeScale);
        nextStart = daySerial(candidateStart) > daySerial(dragState.originalEnd) ? dragState.originalEnd : candidateStart;
      }

      if (dragState.mode === "resize-end") {
        const candidateEnd = addScaleUnits(dragState.originalEnd, delta, timeScale);
        nextEnd = daySerial(candidateEnd) < daySerial(dragState.originalStart) ? dragState.originalStart : candidateEnd;
      }

      updateTask(dragState.taskId, {
        startDate: nextStart.toISOString(),
        endDate: nextEnd.toISOString(),
        dueDate: nextEnd.toISOString()
      });
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;

      const interactionMode = barDragIntentRef.current;
      barDragIntentRef.current = "pending";

      if (dragState.mode === "move" && interactionMode === "tree") {
        const dropTarget = treeDropTarget;
        setTreeDropTarget(null);
        dragDeltaRef.current = 0;
        setDragState(null);

        if (!dropTarget) return;
        const reordered = applyTreeReorderRef.current(dragState.taskId, dropTarget.taskId, dropTarget.position);
        if (!reordered) {
          toast.warning("트리 이동을 적용할 수 없습니다.");
        }
        return;
      }

      const appliedDelta = dragDeltaRef.current;
      dragDeltaRef.current = 0;
      setTreeDropTarget(null);
      setDragState(null);

      if (dragState.mode === "move" && appliedDelta === 0) return;

      const target = useVisualKanbanStore.getState().tasks.find((task) => task.id === dragState.taskId);
      if (!target) return;
      const { start, end } = rangeForTask(target);
      toast.success(`"${target.title}" 일정이 ${formatShortDate(start)} ~ ${formatShortDate(end)}로 업데이트되었습니다.`);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [dragState, scale.columnWidth, timeScale, treeDropTarget, updateTask, writable]);

  useEffect(() => {
    if (!columnResizeState) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== columnResizeState.pointerId) return;
      const delta = event.clientX - columnResizeState.originX;
      const nextWidth = clamp(Math.round(columnResizeState.originWidth + delta), 300, 760);
      setLeftColumnWidth(nextWidth);
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== columnResizeState.pointerId) return;
      setColumnResizeState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [columnResizeState]);

  if (!canRead(ganttRole)) {
    return <FeatureAccessDenied feature="Gantt" />;
  }

  if (!project) {
    return (
      <Card className={neoCard}>
        <CardTitle>프로젝트를 찾을 수 없습니다.</CardTitle>
        <CardDescription className="mt-1">잘못된 프로젝트 ID입니다: {projectId}</CardDescription>
      </Card>
    );
  }

  const activeFilterCount = Number(Boolean(searchQuery.trim())) + Number(assignmentViewMode !== "all");
  const assignmentMode = assignmentModeMeta[assignmentViewMode];
  const AssignmentModeIcon = assignmentMode.icon;

  return (
    <section className="space-y-3">
      {!writable ? (
        <Card className={`${neoCard} border-amber-700 bg-amber-100 dark:border-amber-400 dark:bg-amber-950/50`}>
          <CardTitle className="text-amber-800 dark:text-amber-300">읽기 전용 모드</CardTitle>
          <CardDescription className="mt-1 text-amber-700 dark:text-amber-400">
            현재 권한에서는 조회만 가능합니다. 일정 이동/리사이즈, 작업 추가/삭제, 색상/참여자 변경은 Editor 이상에서 사용할 수 있습니다.
          </CardDescription>
        </Card>
      ) : null}

      <div className="space-y-1">
        <div className={`flex flex-wrap items-center justify-end gap-1.5 px-2 py-2 ${neoPanel} [&_button]:border-2 [&_button]:border-zinc-900 [&_button]:shadow-[2px_2px_0_0_rgb(24,24,27)] [&_button]:transition [&_button:hover]:-translate-y-0.5 [&_button:hover]:shadow-none dark:[&_button]:border-zinc-100 dark:[&_button]:shadow-[2px_2px_0_0_rgb(0,0,0)]`}>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => shiftWindow(-1)}>
              ← 이전 {scale.label}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => shiftWindow(1)}>
              다음 {scale.label} →
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={jumpToToday}>
              이번 기준으로 이동
            </Button>
            <div className={`flex h-7 items-center gap-1 rounded-md bg-white px-1.5 text-xs dark:bg-zinc-900 ${neoControl}`}>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">열</span>
              <button
                type="button"
                className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 ${neoControl}`}
                onClick={() => updateTimelineColumnCount(timeScale, timelineColumnCount - 1)}
                aria-label={`${scale.label} 타임라인 열 수 감소`}
              >
                −
              </button>
              <span
                className={`inline-flex h-5 min-w-9 items-center justify-center rounded bg-zinc-50 px-1 text-[11px] font-medium tabular-nums text-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 ${neoControl}`}
              >
                {timelineColumnCount}
              </span>
              <button
                type="button"
                className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 ${neoControl}`}
                onClick={() => updateTimelineColumnCount(timeScale, timelineColumnCount + 1)}
                aria-label={`${scale.label} 타임라인 열 수 증가`}
              >
                +
              </button>
            </div>
            {(Object.keys(timeScaleMeta) as TimeScale[]).map((scaleKey) => (
              <Button
                key={scaleKey}
                variant={timeScale === scaleKey ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setScaleFromToolbar(scaleKey)}
              >
                {timeScaleMeta[scaleKey].label}
              </Button>
            ))}
            <Button
              size="icon"
              variant={searchPopupOpen ? "secondary" : "ghost"}
              className="h-7 w-7"
              onClick={() => setSearchPopupOpen((prev) => !prev)}
              title="검색/필터 팝업"
              aria-label="검색/필터 팝업 열기"
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant={addPopupOpen ? "secondary" : "ghost"}
              className="h-7 w-7"
              onClick={() => setAddPopupOpen((prev) => !prev)}
              disabled={!writable}
              title={writable ? "작업 추가 팝업" : "읽기 전용"}
              aria-label="작업 추가 팝업 열기"
            >
              <CirclePlus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setCollapsedIds(new Set())}>
              전체 펼치기
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const collapsible = timelineRows.filter((row) => row.hasChildren).map((row) => row.task.id);
                setCollapsedIds(new Set(collapsible));
              }}
            >
              전체 접기
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              title="엑셀(.xlsx)로 저장"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {isExportingExcel ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      </div>

      <Card className={`${neoCard} overflow-hidden p-0`}>
        <div className="max-h-[76vh] overflow-auto">
            <div className="min-w-max" style={{ width: leftColumnWidth + timelineWidth }}>
              <div className="sticky top-0 z-40 flex border-b-2 border-zinc-900 bg-zinc-100/95 backdrop-blur dark:border-zinc-100 dark:bg-zinc-900/95">
                <div
                  className="sticky left-0 z-50 shrink-0 border-r-2 border-zinc-900 bg-zinc-100/95 p-3 shadow-[2px_0_0_0_rgba(24,24,27,0.95)] dark:border-zinc-100 dark:bg-zinc-900/95 dark:shadow-[2px_0_0_0_rgba(228,228,231,0.95)]"
                  style={{ width: leftColumnWidth, minWidth: leftColumnWidth, maxWidth: leftColumnWidth }}
                >
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">작업 트리</p>
                      <Button
                        size="sm"
                        variant={projectPopupOpen ? "default" : "outline"}
                        className="h-7 max-w-[220px] gap-1 px-2 text-xs"
                        onClick={() => setProjectPopupOpen((prev) => !prev)}
                        title="프로젝트 선택/추가"
                      >
                        <FolderKanban className="h-3.5 w-3.5" />
                        <span className="truncate">{project.name}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant={assignmentViewMode === "all" ? "outline" : "secondary"}
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={cycleAssignmentViewMode}
                        title={`나에게 지정한 것만 보기: ${assignmentMode.label}`}
                      >
                        <AssignmentModeIcon className="h-3.5 w-3.5" />
                        <span>{assignmentMode.shortLabel}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant={highlightMyAssignments ? "secondary" : "outline"}
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => setHighlightMyAssignments((prev) => !prev)}
                        aria-pressed={highlightMyAssignments}
                        title="나에게 지정한 것 강조"
                      >
                        {highlightMyAssignments ? <CheckSquare2 className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                        <span>강조</span>
                      </Button>
                    </div>
                    <div
                      className="absolute inset-y-0 -right-4 z-[60] flex w-3 cursor-col-resize items-center justify-center"
                      onPointerDown={beginColumnResize}
                      title="작업명 열 너비 조절"
                    >
                      <div className="h-8 w-[2px] rounded-full bg-zinc-300 dark:bg-zinc-600" />
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0" style={{ width: timelineWidth }}>
                  {columns.map((column) => (
                    <div
                      key={`${column.primary}-${column.index}`}
                      className={cn(
                        "border-l border-zinc-200/80 px-2 py-2 text-center text-xs dark:border-zinc-700/80",
                        column.isCurrent ? "bg-sky-100/70 dark:bg-sky-900/45" : ""
                      )}
                      style={{ width: scale.columnWidth }}
                    >
                      <p className="font-semibold">{column.primary}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{column.secondary}</p>
                    </div>
                  ))}
                </div>
              </div>

              {timelineRows.length === 0 ? (
                <div className="flex border-b border-zinc-200/80 dark:border-zinc-700/80">
                  <div
                    className="sticky left-0 z-30 shrink-0 border-r border-zinc-200 bg-white/95 px-3 py-3 shadow-[1px_0_0_0_rgba(228,228,231,0.9)] backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:shadow-[1px_0_0_0_rgba(63,63,70,0.95)]"
                    style={{ width: leftColumnWidth, minWidth: leftColumnWidth, maxWidth: leftColumnWidth, minHeight: rowHeight }}
                  >
                    <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">테스크 항목 없음</p>
                  </div>
                  <div
                    className="relative shrink-0 flex items-center justify-center text-xs text-zinc-500 dark:text-zinc-400"
                    style={{ width: timelineWidth, minHeight: rowHeight }}
                  >
                    표시된 일정이 없습니다. 필터를 조정하거나 작업을 추가해 보세요.
                  </div>
                </div>
              ) : (
                timelineRows.map((row) => {
                const participants = row.participants;
                const visibleParticipants = participants.slice(0, maxVisibleAvatars);
                const overflowCount = participants.length - visibleParticipants.length;
                const assignedToMe = isAssignedToCurrentUser(row.task, participants);
                const highlighted = highlightMyAssignments && assignedToMe;
                const dropPosition = treeDropTarget?.taskId === row.task.id ? treeDropTarget.position : null;
                const canShowDropInside = dropPosition === "inside" && treeDragTaskId && treeDragTaskId !== row.task.id;

                return (
                  <div
                    key={row.task.id}
                    data-tree-row-task-id={row.task.id}
                    className={cn(
                      "group relative flex border-b border-zinc-200/80 transition hover:bg-zinc-50/60 dark:border-zinc-700/80 dark:hover:bg-zinc-800/20",
                      highlighted
                        ? "bg-amber-100/70 shadow-[inset_0_0_0_2px_rgba(245,158,11,0.45),0_0_0_1px_rgba(245,158,11,0.35)] dark:bg-amber-900/30 dark:shadow-[inset_0_0_0_2px_rgba(251,191,36,0.45),0_0_0_1px_rgba(251,191,36,0.25)]"
                        : "",
                      canShowDropInside ? "bg-violet-50/75 dark:bg-violet-950/30" : ""
                    )}
                    onDoubleClick={() => openDetailPopup(row.task.id)}
                    onDragOver={(event) => handleTreeDragOver(event, row.task)}
                    onDrop={(event) => handleTreeDrop(event, row.task)}
                    onDragLeave={(event) => {
                      if (!treeDropTarget || treeDropTarget.taskId !== row.task.id) return;
                      const nextTarget = event.relatedTarget;
                      if (nextTarget && event.currentTarget.contains(nextTarget as Node)) return;
                      setTreeDropTarget(null);
                    }}
                  >
                    {dropPosition === "before" ? (
                      <div className="pointer-events-none absolute inset-x-0 top-0 z-50 h-0.5 bg-violet-500 dark:bg-violet-400" />
                    ) : null}
                    {dropPosition === "after" ? (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 h-0.5 bg-violet-500 dark:bg-violet-400" />
                    ) : null}

                    <div
                      className={cn(
                        "sticky left-0 z-30 shrink-0 border-r border-zinc-200 bg-white/95 px-2.5 py-2 shadow-[1px_0_0_0_rgba(228,228,231,0.9)] backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:shadow-[1px_0_0_0_rgba(63,63,70,0.95)]",
                        highlighted ? "bg-amber-100/85 ring-2 ring-inset ring-amber-400/70 dark:bg-amber-900/45 dark:ring-amber-500/70" : "",
                        canShowDropInside ? "ring-2 ring-inset ring-violet-400/70 dark:ring-violet-600/80" : ""
                      )}
                      style={{ width: leftColumnWidth, minWidth: leftColumnWidth, maxWidth: leftColumnWidth, minHeight: rowHeight }}
                    >
                      <div className="flex h-full items-center gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1.5" style={{ paddingLeft: row.depth * 16 }}>
                          {row.hasChildren ? (
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-transparent text-zinc-500 hover:border-zinc-300 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleCollapse(row.task.id);
                              }}
                              onDoubleClick={(event) => event.stopPropagation()}
                            >
                              {row.collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          ) : (
                            <span className="inline-block h-5 w-5" />
                          )}

                          <p
                            className={cn(
                              "truncate text-sm font-semibold",
                              writable ? "cursor-grab select-none active:cursor-grabbing" : "cursor-default"
                            )}
                            draggable={writable}
                            onDragStart={(event) => handleTreeDragStart(event, row.task)}
                            onDragEnd={handleTreeDragEnd}
                            title="드래그해서 트리 순서/계층 이동"
                          >
                            {row.task.title}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <div className="hidden -space-x-2 lg:flex">
                            {visibleParticipants.map((participantId, index) => {
                              const participant = userMap.get(participantId);
                              const label = participant?.displayName ?? participantId;
                              return (
                                <div
                                  key={`${row.task.id}-${participantId}-${index}`}
                                  className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-zinc-200 text-[9px] font-semibold text-zinc-700 shadow-sm dark:border-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                                  title={label}
                                >
                                  {initials(label)}
                                </div>
                              );
                            })}
                            {overflowCount > 0 ? (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full border border-white bg-zinc-300 text-[9px] font-semibold text-zinc-700 shadow-sm dark:border-zinc-900 dark:bg-zinc-600 dark:text-zinc-100">
                                +{overflowCount}
                              </div>
                            ) : null}
                          </div>

                          <div
                            className="flex items-center gap-0.5 opacity-70 transition group-hover:opacity-100"
                            onDoubleClick={(event) => event.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              onClick={(event) => {
                                event.stopPropagation();
                                openDetailPopup(row.task.id);
                              }}
                              title="작업 상세 열기"
                              aria-label={`${row.task.title} 상세 열기`}
                            >
                              상세
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleQuickAddChild(row.task, row.start, row.end);
                              }}
                              disabled={!writable}
                              title="하위 작업 추가"
                            >
                              <CirclePlus className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleRemoveTask(row.task);
                              }}
                              disabled={!writable}
                              title="작업 삭제"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="relative shrink-0" style={{ width: timelineWidth, minHeight: rowHeight }}>
                      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
                        {columns.map((column, index) => (
                          <div
                            key={`${row.task.id}-${column.primary}-${index}`}
                            className={cn(
                              "border-l border-zinc-200/70 dark:border-zinc-700/70",
                              index % 2 === 1 ? "bg-zinc-50/20 dark:bg-zinc-800/20" : "",
                              column.isCurrent ? "bg-sky-100/45 dark:bg-sky-900/25" : ""
                            )}
                          />
                        ))}
                      </div>

                      {row.bar ? (
                        <>
                          {row.depth > 0 ? (
                            (() => {
                              const connectorWidth = Math.min(18 + row.depth * 8, Math.max(0, row.bar.left - 2));
                              if (connectorWidth <= 0) return null;
                              return (
                                <div
                                  className="absolute top-1/2 -translate-y-1/2"
                                  style={{ left: row.bar.left - connectorWidth, width: connectorWidth }}
                                >
                                  <div className="h-px w-full bg-zinc-400/70 dark:bg-zinc-500/80" />
                                </div>
                              );
                            })()
                          ) : null}

                          <div className="absolute top-1/2 -translate-y-1/2" style={{ left: row.bar.left, width: row.bar.width }}>
                            <div
                              className={cn(
                                "relative flex h-8 items-center rounded-md px-2 text-[11px] font-semibold text-white shadow-sm ring-1 ring-black/10",
                                writable ? "cursor-grab active:cursor-grabbing" : "cursor-default",
                                highlighted ? "ring-2 ring-amber-300 shadow-[0_0_0_2px_rgba(251,191,36,0.35)]" : ""
                              )}
                              style={{ backgroundColor: row.color }}
                              title={`${row.task.title} · ${formatShortDate(row.start)} ~ ${formatShortDate(row.end)}`}
                              onPointerDown={writable ? (event) => beginBarInteraction(event, row, "move") : undefined}
                            >
                              {writable ? (
                                <div
                                  className="absolute inset-y-0 left-0 w-2 cursor-ew-resize"
                                  onPointerDown={(event) => beginBarInteraction(event, row, "resize-start")}
                                />
                              ) : null}

                              <div className="flex min-w-0 items-center gap-1">
                                {row.bar.clippedStart ? <span className="text-[10px]">◀</span> : null}
                                <span
                                  className={cn("truncate", writable ? "cursor-grab select-none active:cursor-grabbing" : "")}
                                  title="그래프를 좌우로 드래그해 일정 이동, 위아래로 드래그해 트리 이동"
                                >
                                  {row.task.title}
                                </span>
                                {row.bar.clippedEnd ? <span className="text-[10px]">▶</span> : null}
                              </div>

                              {writable ? (
                                <div
                                  className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
                                  onPointerDown={(event) => beginBarInteraction(event, row, "resize-end")}
                                />
                              ) : null}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500 dark:text-zinc-400">현재 타임라인 창 밖</div>
                      )}
                    </div>
                  </div>
                );
              })
              )}
            </div>
          </div>
      </Card>

      <PopupShell
        open={searchPopupOpen}
        onClose={() => setSearchPopupOpen(false)}
        title="검색 / 필터"
        description="작업명·설명·참여자 검색과 담당/참여자 범위를 여기에서 조정합니다."
        widthClassName="max-w-2xl"
      >
        <div className="space-y-3">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="작업명/설명/참여자 검색"
            aria-label="간트 검색"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={assignmentViewMode === "all" ? "outline" : "default"}
              size="sm"
              onClick={cycleAssignmentViewMode}
              className="gap-1"
            >
              <AssignmentModeIcon className="h-3.5 w-3.5" />
              {assignmentMode.label}
            </Button>
            <Button
              variant={highlightMyAssignments ? "default" : "outline"}
              size="sm"
              onClick={() => setHighlightMyAssignments((prev) => !prev)}
              aria-pressed={highlightMyAssignments}
              className="gap-1"
            >
              {highlightMyAssignments ? <CheckSquare2 className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              나에게 지정한 것 강조
            </Button>
          </div>

          <div className="flex items-center justify-end gap-2">
            {activeFilterCount > 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                필터 초기화
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={() => setSearchPopupOpen(false)}>
              적용
            </Button>
          </div>
        </div>
      </PopupShell>

      <PopupShell
        open={addPopupOpen}
        onClose={() => setAddPopupOpen(false)}
        title="작업 추가"
        description="작업명, 설명, 공개범위, 시작일, 종료일, 참여자, 색상을 설정합니다."
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-700/80 dark:bg-zinc-900/60">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">기본 정보</p>
            <div className="mt-2 space-y-2">
              <label className="space-y-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">작업명 *</span>
                <Input
                  value={newTaskForm.title}
                  onChange={(event) => setNewTaskForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="예: IA 구조 정의"
                  disabled={!writable}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">설명</span>
                <textarea
                  value={newTaskForm.description}
                  onChange={(event) => setNewTaskForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="작업 목적, 완료 조건 등을 적어주세요."
                  disabled={!writable}
                  rows={4}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-700/80 dark:bg-zinc-900/60">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">일정</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">시작일</span>
                <Input
                  type="date"
                  value={newTaskForm.startDate}
                  onChange={(event) => setNewTaskForm((prev) => ({ ...prev, startDate: event.target.value }))}
                  disabled={!writable}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">종료일</span>
                <Input
                  type="date"
                  value={newTaskForm.endDate}
                  onChange={(event) => setNewTaskForm((prev) => ({ ...prev, endDate: event.target.value }))}
                  disabled={!writable}
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-700/80 dark:bg-zinc-900/60">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">공개 범위</p>
            <div className="mt-2 inline-flex rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
              <button
                type="button"
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  newTaskForm.visibility === "shared"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                )}
                onClick={() => setNewTaskForm((prev) => ({ ...prev, visibility: "shared" }))}
                disabled={!writable}
              >
                공개
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  newTaskForm.visibility === "private"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                )}
                onClick={() => setNewTaskForm((prev) => ({ ...prev, visibility: "private" }))}
                disabled={!writable}
              >
                개인
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 px-3 py-2 dark:border-zinc-700/80 dark:bg-zinc-900/60">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">참여자</p>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{newTaskForm.participantIds.length}명 선택됨</span>
            </div>
            <UserAutocompleteMultiSelect
              options={userAutocompleteOptions}
              selectedIds={newTaskForm.participantIds}
              onChange={(nextSelectedIds) => setNewTaskForm((prev) => ({ ...prev, participantIds: nextSelectedIds }))}
              placeholder="참여자 이름 입력"
              disabled={!writable}
            />
          </div>

          <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 px-3 py-2 dark:border-zinc-700/80 dark:bg-zinc-900/60">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">색상</span>
              <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-[11px] dark:border-zinc-700">{newTaskForm.color.toUpperCase()}</span>
              <Button
                type="button"
                variant={newTaskForm.colorMode === "auto" ? "default" : "outline"}
                size="sm"
                onClick={() => setNewTaskForm((prev) => ({ ...prev, colorMode: "auto" }))}
                disabled={!writable}
              >
                자동
              </Button>
              <Button
                type="button"
                variant={newTaskForm.colorMode === "manual" ? "default" : "outline"}
                size="sm"
                onClick={() => setNewTaskForm((prev) => ({ ...prev, colorMode: "manual" }))}
                disabled={!writable}
              >
                수동
              </Button>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-1">
              {colorPalette.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`색상 ${swatch}`}
                  className={cn(
                    "h-5 w-5 rounded-full border transition",
                    newTaskForm.color.toLowerCase() === swatch ? "scale-110 border-zinc-900 dark:border-zinc-100" : "border-zinc-300 dark:border-zinc-700"
                  )}
                  style={{ backgroundColor: swatch }}
                  onClick={() => setNewTaskForm((prev) => ({ ...prev, color: swatch, colorMode: "manual" }))}
                  disabled={!writable}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <Button type="button" variant="outline" onClick={() => setAddPopupOpen(false)}>
              취소
            </Button>
            <Button type="submit" disabled={!writable}>
              <CirclePlus className="h-4 w-4" />
              작업 추가
            </Button>
          </div>
        </form>
      </PopupShell>

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
                    key={`project-option-${item.id}`}
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
              onChange={(event) => setNewProjectForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="프로젝트명"
              disabled={!writable}
            />
            <Input
              value={newProjectForm.description}
              onChange={(event) => setNewProjectForm((prev) => ({ ...prev, description: event.target.value }))}
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
        open={Boolean(detailTask)}
        onClose={closeDetailPopup}
        title={detailForm?.title?.trim() || detailTask?.title || "작업 상세"}
        editableTitle={
          detailTask
            ? {
                value: detailForm?.title ?? detailTask.title,
                onChange: (nextValue) =>
                  setDetailForm((prev) => {
                    if (prev) {
                      return {
                        ...prev,
                        title: nextValue
                      };
                    }
                    const range = rangeForTask(detailTask);
                    return {
                      title: nextValue,
                      description: detailTask.description,
                      participantIds: readTaskParticipantIds(detailTask),
                      visibility: detailTask.visibility,
                      startDate: toDateInputValue(range.start),
                      endDate: toDateInputValue(range.end)
                    };
                  }),
                disabled: !writable,
                placeholder: "작업명"
              }
            : undefined
        }
        widthClassName="max-w-3xl"
      >
        {detailTask ? (
          (() => {
            const detailRange = rangeForTask(detailTask);
            const draft: DetailFormState = detailForm ?? {
              title: detailTask.title,
              description: detailTask.description,
              participantIds: readTaskParticipantIds(detailTask),
              visibility: detailTask.visibility,
              startDate: toDateInputValue(detailRange.start),
              endDate: toDateInputValue(detailRange.end)
            };
            return (
              <form className="space-y-4" onSubmit={handleDetailSave}>
                {!writable ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                    읽기 전용 권한입니다. 상세 정보는 확인만 가능합니다.
                  </p>
                ) : null}

                <label className="space-y-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">설명</span>
                  <textarea
                    value={draft.description}
                    onChange={(event) =>
                      setDetailForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              description: event.target.value
                            }
                          : prev
                      )
                    }
                    disabled={!writable}
                    rows={4}
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </label>

                <div className="grid gap-2 md:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">시작일</span>
                    <Input
                      type="date"
                      value={draft.startDate}
                      onChange={(event) =>
                        setDetailForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                startDate: event.target.value
                              }
                            : prev
                        )
                      }
                      disabled={!writable}
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">종료일</span>
                    <Input
                      type="date"
                      value={draft.endDate}
                      onChange={(event) =>
                        setDetailForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                endDate: event.target.value
                              }
                            : prev
                        )
                      }
                      disabled={!writable}
                    />
                  </label>

                  <div className="space-y-1">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">공개 범위</span>
                    <div className="flex h-10 w-full items-center rounded-md border border-zinc-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
                      <button
                        type="button"
                        className={cn(
                          "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition",
                          draft.visibility === "shared"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        )}
                        onClick={() =>
                          setDetailForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  visibility: "shared"
                                }
                              : prev
                          )
                        }
                        disabled={!writable}
                      >
                        공개
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition",
                          draft.visibility === "private"
                            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                            : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        )}
                        onClick={() =>
                          setDetailForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  visibility: "private"
                                }
                              : prev
                          )
                        }
                        disabled={!writable}
                      >
                        개인
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3 dark:border-zinc-700/80 dark:bg-zinc-800/40">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">색상</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {colorPalette.map((swatch) => (
                        <button
                          key={`detail-${detailTask.id}-${swatch}`}
                          type="button"
                          aria-label={`색상 ${swatch}`}
                          className={cn(
                            "h-5 w-5 rounded-full border transition",
                            detailRow?.color.toLowerCase() === swatch ? "scale-110 border-zinc-900 dark:border-zinc-100" : "border-zinc-300 dark:border-zinc-700"
                          )}
                          style={{ backgroundColor: swatch }}
                          onClick={() => handleRowColor(detailTask, swatch)}
                          disabled={!writable}
                        />
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant={detailRow?.explicitColor ? "outline" : "default"}
                        onClick={() => handleAutoColor(detailTask)}
                        disabled={!writable}
                      >
                        자동
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3 dark:border-zinc-700/80 dark:bg-zinc-800/40">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">참여자 추가</p>
                    <div className="mt-2">
                      <UserAutocompleteMultiSelect
                        options={userAutocompleteOptions}
                        selectedIds={draft.participantIds}
                        onChange={(nextSelectedIds) =>
                          setDetailForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  participantIds: nextSelectedIds
                                }
                              : prev
                          )
                        }
                        placeholder="참여자 이름 입력"
                        disabled={!writable}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    {writable ? (
                      <Button type="submit">
                        저장
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" onClick={closeDetailPopup}>
                      닫기
                    </Button>
                  </div>

                  {writable ? (
                    <div className="ml-auto flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => handleQuickAddChild(detailTask, detailRange.start, detailRange.end)}>
                        <CirclePlus className="h-4 w-4" />
                        하위 작업 추가
                      </Button>
                      <Button type="button" variant="danger" onClick={() => handleRemoveTask(detailTask)}>
                        <Trash2 className="h-4 w-4" />
                        작업 삭제
                      </Button>
                    </div>
                  ) : null}
                </div>
              </form>
            );
          })()
        ) : null}
      </PopupShell>
    </section>
  );
}
