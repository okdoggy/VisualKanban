"use client";

import { type ComponentType, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, Check, CirclePlus, Flag, Repeat2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCurrentUser, useVisualKanbanStore } from "@/lib/store";
import type { PersonalTodo, TodoPriority, TodoRecurrence, TodoWeekday } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { useShallow } from "zustand/react/shallow";

interface TodoDetailDraft {
  title: string;
  description: string;
  priority: TodoPriority;
  recurrenceType: TodoRecurrence["type"];
  weekdays: TodoWeekday[];
  repeatColor: string;
}

type TodoSortMode = "priority" | "created" | "weekly_first";

const priorityOptions: TodoPriority[] = [1, 2, 3, 4, 5, 6, 7];

const weekdayOptions: { value: TodoWeekday; label: string }[] = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" }
];

const repeatColorPreset = ["#22c55e", "#0ea5e9", "#a855f7", "#f97316", "#ef4444", "#facc15", "#14b8a6"];

const sortOptions: { value: TodoSortMode; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { value: "priority", label: "우선순위 순", icon: Flag },
  { value: "created", label: "등록된 순", icon: ArrowDownUp },
  { value: "weekly_first", label: "매주 반복순", icon: Repeat2 }
];
const sortCycleOrder: TodoSortMode[] = ["priority", "created", "weekly_first"];
const TOOLBAR_CONTROL_CLASS =
  "border-2 border-zinc-900 shadow-[2px_2px_0_0_rgb(24,24,27)] transition-[transform,box-shadow,background-color,border-color,color] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-none active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none dark:border-zinc-100 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]";

function formatRecurrence(recurrence: TodoRecurrence) {
  if (recurrence.type === "none") return "반복 없음";
  if (recurrence.type === "daily") return "매일";
  const labels = recurrence.weekdays
    .slice()
    .sort((left, right) => left - right)
    .map((weekday) => weekdayOptions.find((option) => option.value === weekday)?.label ?? "?")
    .join(",");
  return `매주 ${labels}`;
}

function sortWeekdays(weekdays: TodoWeekday[]) {
  return [...new Set(weekdays)].sort((left, right) => left - right);
}

function createDetailDraft(todo: PersonalTodo): TodoDetailDraft {
  return {
    title: todo.title,
    description: todo.description,
    priority: todo.priority,
    recurrenceType: todo.recurrence.type,
    weekdays: todo.recurrence.type === "weekly" ? sortWeekdays(todo.recurrence.weekdays) : [],
    repeatColor: todo.repeatColor
  };
}

function buildRecurrence(draft: TodoDetailDraft): TodoRecurrence {
  if (draft.recurrenceType === "none") {
    return { type: "none" };
  }
  if (draft.recurrenceType === "daily") {
    return { type: "daily" };
  }
  return {
    type: "weekly",
    weekdays: sortWeekdays(draft.weekdays)
  };
}

function nextMidnightDelayMs() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
  return Math.max(1_000, next.getTime() - now.getTime());
}

export default function TodoPage() {
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const detailTitleRef = useRef<HTMLInputElement>(null);

  const [quickTitle, setQuickTitle] = useState("");
  const [detailTodoId, setDetailTodoId] = useState<string | null>(null);
  const [detailDraft, setDetailDraft] = useState<TodoDetailDraft | null>(null);
  const [sortMode, setSortMode] = useState<TodoSortMode>("priority");

  const { users, currentUserId, personalTodos, addTodo, updateTodo, toggleTodo, removeTodo, cleanupTodos } = useVisualKanbanStore(
    useShallow((state) => ({
      users: state.users,
      currentUserId: state.currentUserId,
      personalTodos: state.personalTodos,
      addTodo: state.addTodo,
      updateTodo: state.updateTodo,
      toggleTodo: state.toggleTodo,
      removeTodo: state.removeTodo,
      cleanupTodos: state.cleanupTodos
    }))
  );

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);

  const myTodos = useMemo(() => {
    if (!currentUserId) return [];

    const compareBySortMode = (left: PersonalTodo, right: PersonalTodo) => {
      if (sortMode === "priority") {
        if (left.priority !== right.priority) {
          return left.priority - right.priority;
        }
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }

      if (sortMode === "weekly_first") {
        const recurrenceWeight = (todo: PersonalTodo) => {
          if (todo.recurrence.type === "weekly") return 0;
          if (todo.recurrence.type === "daily") return 1;
          return 2; // none
        };

        const weightDiff = recurrenceWeight(left) - recurrenceWeight(right);
        if (weightDiff !== 0) {
          return weightDiff;
        }
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    };

    return personalTodos
      .filter((todo) => todo.ownerId === currentUserId)
      .sort(compareBySortMode);
  }, [currentUserId, personalTodos, sortMode]);

  const selectedSort = useMemo(
    () => sortOptions.find((option) => option.value === sortMode) ?? sortOptions[0],
    [sortMode]
  );
  const SelectedSortIcon = selectedSort.icon;

  const activeTodo = useMemo(() => {
    if (!detailTodoId) return null;
    return myTodos.find((todo) => todo.id === detailTodoId) ?? null;
  }, [detailTodoId, myTodos]);

  const doneCount = useMemo(() => myTodos.filter((todo) => todo.completed).length, [myTodos]);

  const closeDetail = useCallback(() => {
    setDetailTodoId(null);
    setDetailDraft(null);
  }, []);

  const runLifecycleCleanup = useCallback(() => {
    cleanupTodos();
  }, [cleanupTodos]);

  useEffect(() => {
    if (!currentUserId) return;

    runLifecycleCleanup();

    let timeoutId: number;
    const schedule = () => {
      timeoutId = window.setTimeout(() => {
        runLifecycleCleanup();
        schedule();
      }, nextMidnightDelayMs());
    };
    schedule();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        runLifecycleCleanup();
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [currentUserId, runLifecycleCleanup]);

  useEffect(() => {
    if (!detailTodoId) return;
    requestAnimationFrame(() => {
      detailTitleRef.current?.focus();
      detailTitleRef.current?.select();
    });
  }, [detailTodoId]);

  const addQuickTodo = useCallback(() => {
    const title = quickTitle.trim();
    if (!title) return;

    const result = addTodo({
      title,
      priority: 4,
      recurrence: { type: "none" },
      repeatColor: "#22c55e"
    });

    if (!result.ok) {
      toast.error(result.reason ?? "To do 추가에 실패했습니다.");
      return;
    }

    setQuickTitle("");
    toast.success("To do를 추가했습니다.");
    requestAnimationFrame(() => quickAddInputRef.current?.focus());
  }, [addTodo, quickTitle]);

  const onToggleTodo = useCallback(
    (todoId: string) => {
      const target = myTodos.find((todo) => todo.id === todoId);
      const result = toggleTodo(todoId);
      if (!result.ok) {
        toast.error(result.reason ?? "상태 변경 실패");
        return;
      }

      if (target?.completed) {
        toast.success("To do를 다시 활성화했습니다.");
        return;
      }
      toast.success("To do 완료 처리됨");
    },
    [myTodos, toggleTodo]
  );

  const onOpenDetail = useCallback((todo: PersonalTodo) => {
    setDetailTodoId(todo.id);
    setDetailDraft(createDetailDraft(todo));
  }, []);

  const onSaveDetail = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!detailTodoId || !detailDraft) return;

      const title = detailDraft.title.trim();
      if (!title) {
        toast.error("제목은 필수입니다.");
        return;
      }

      if (detailDraft.recurrenceType === "weekly" && detailDraft.weekdays.length === 0) {
        toast.error("반복 요일을 최소 1개 선택해 주세요.");
        return;
      }

      const result = updateTodo(detailTodoId, {
        title,
        description: detailDraft.description,
        priority: detailDraft.priority,
        recurrence: buildRecurrence(detailDraft),
        repeatColor: detailDraft.repeatColor
      });

      if (!result.ok) {
        toast.error(result.reason ?? "상세 저장 실패");
        return;
      }

      closeDetail();
      toast.success("To do 상세 내용을 저장했습니다.");
    },
    [closeDetail, detailDraft, detailTodoId, updateTodo]
  );

  const onDeleteTodo = useCallback(() => {
    if (!detailTodoId) return;
    const result = removeTodo(detailTodoId);
    if (!result.ok) {
      toast.error(result.reason ?? "삭제 실패");
      return;
    }

    closeDetail();
    toast.success("To do를 삭제했습니다.");
  }, [closeDetail, detailTodoId, removeTodo]);

  const cycleSortMode = useCallback(() => {
    setSortMode((previous) => {
      const currentIndex = sortCycleOrder.indexOf(previous);
      return sortCycleOrder[(currentIndex + 1) % sortCycleOrder.length] ?? "priority";
    });
  }, []);

  if (!currentUser) {
    return (
      <Card className="p-6">
        <CardTitle>To do 불러오는 중...</CardTitle>
        <CardDescription className="mt-2">로그인 세션을 확인하고 있습니다.</CardDescription>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="neo-panel p-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addQuickTodo();
          }}
        >
          <Input
            ref={quickAddInputRef}
            value={quickTitle}
            onChange={(event) => setQuickTitle(event.target.value)}
            placeholder="할 일을 빠르게 입력하고 Enter"
            className="h-10 flex-1"
            aria-label="Quick add todo"
          />
          <Button type="submit" size="sm" disabled={!quickTitle.trim()}>
            <CirclePlus className="h-4 w-4" />
            추가
          </Button>
        </form>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-zinc-900 bg-white px-2.5 py-2 shadow-[3px_3px_0_0_rgb(24,24,27)]">
          <Badge variant="neutral" className="rounded-xl px-2 py-0.5 text-[11px] shadow-none">
            전체 {myTodos.length}
          </Badge>
          <Badge variant="warning" className="rounded-xl px-2 py-0.5 text-[11px] shadow-none">
            진행중 {myTodos.length - doneCount}
          </Badge>
          <Badge variant="success" className="rounded-xl px-2 py-0.5 text-[11px] shadow-none">
            완료 {doneCount}
          </Badge>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn("ml-auto h-7 gap-1 px-2 text-xs", TOOLBAR_CONTROL_CLASS)}
            onClick={cycleSortMode}
            title={`정렬 변경: ${selectedSort.label}`}
            aria-label={`정렬 변경: 현재 ${selectedSort.label}`}
          >
            <SelectedSortIcon className="h-3.5 w-3.5" />
            <span>{selectedSort.label}</span>
          </Button>
        </div>
        <CardDescription className="mt-2 text-xs">
          비반복 완료 항목은 다음 00시에 자동 삭제됩니다.
        </CardDescription>
      </Card>

      <Card className="neo-panel p-2">
        {myTodos.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <CardTitle>등록된 To do가 없습니다</CardTitle>
            <CardDescription className="mt-1">상단 입력창에서 바로 추가해보세요.</CardDescription>
          </div>
        ) : (
          <ul className="max-h-[calc(100vh-19rem)] overflow-auto divide-y-2 divide-zinc-200 pr-1">
            {myTodos.map((todo) => {
              const line = todo.description ? `${todo.title} — ${todo.description}` : todo.title;

              return (
                <li
                  key={todo.id}
                  className="group flex items-center gap-2 px-2 py-2"
                  style={{ borderLeft: `4px solid ${todo.recurrence.type === "none" ? "transparent" : todo.repeatColor}` }}
                >
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => onToggleTodo(todo.id)}
                    className="h-4 w-4 rounded border-2 border-zinc-900"
                    aria-label={`${todo.title} 완료 체크`}
                  />

                  <button
                    type="button"
                    onClick={() => onOpenDetail(todo)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className={cn(
                        "truncate text-sm font-semibold text-zinc-900",
                        todo.completed && "line-through text-zinc-500"
                      )}
                    >
                      {line}
                    </span>
                  </button>

                  <Badge variant={todo.priority <= 2 ? "danger" : todo.priority <= 4 ? "warning" : "info"} className="shrink-0">
                    P{todo.priority}
                  </Badge>

                  {todo.recurrence.type !== "none" ? (
                    <Badge variant="neutral" className="hidden shrink-0 sm:inline-flex">
                      {formatRecurrence(todo.recurrence)}
                    </Badge>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {activeTodo && detailDraft ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/50" onClick={closeDetail} aria-label="상세 닫기" />

          <div role="dialog" aria-modal="true" aria-label="To do 상세" className="neo-panel relative z-10 w-full max-w-xl bg-white p-0">
            <div className="flex items-center justify-between border-b-2 border-zinc-900 px-4 py-3">
              <div>
                <p className="text-sm font-black uppercase tracking-wide">To do 상세</p>
                <p className="text-xs text-zinc-600">반복/우선순위/색상/설명 수정 및 삭제</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={closeDetail} aria-label="닫기">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form className="space-y-3 p-4" onSubmit={onSaveDetail}>
              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-700">제목</span>
                <Input
                  ref={detailTitleRef}
                  value={detailDraft.title}
                  onChange={(event) => setDetailDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))}
                  maxLength={120}
                  required
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-700">설명</span>
                <Input
                  value={detailDraft.description}
                  onChange={(event) => setDetailDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))}
                  placeholder="선택 입력"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-700">우선순위</span>
                  <select
                    value={detailDraft.priority}
                    onChange={(event) =>
                      setDetailDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              priority: Number(event.target.value) as TodoPriority
                            }
                          : prev
                      )
                    }
                  >
                    {priorityOptions.map((priority) => (
                      <option key={priority} value={priority}>
                        P{priority}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-700">반복</span>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { label: "없음", value: "none" },
                      { label: "매일", value: "daily" },
                      { label: "매주", value: "weekly" }
                    ] as const).map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={detailDraft.recurrenceType === option.value ? "default" : "outline"}
                        onClick={() => setDetailDraft((prev) => (prev ? { ...prev, recurrenceType: option.value } : prev))}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {detailDraft.recurrenceType === "weekly" ? (
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-700">반복 요일</p>
                  <div className="flex flex-wrap gap-2">
                    {weekdayOptions.map((weekday) => {
                      const selected = detailDraft.weekdays.includes(weekday.value);

                      return (
                        <Button
                          key={weekday.value}
                          type="button"
                          size="sm"
                          variant={selected ? "default" : "outline"}
                          onClick={() =>
                            setDetailDraft((prev) => {
                              if (!prev) return prev;

                              const exists = prev.weekdays.includes(weekday.value);
                              const nextWeekdays = exists
                                ? prev.weekdays.filter((day) => day !== weekday.value)
                                : [...prev.weekdays, weekday.value];

                              return {
                                ...prev,
                                weekdays: sortWeekdays(nextWeekdays)
                              };
                            })
                          }
                        >
                          {weekday.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-700">반복 색상</p>
                <div className="flex flex-wrap items-center gap-2">
                  {repeatColorPreset.map((color) => {
                    const selected = detailDraft.repeatColor.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setDetailDraft((prev) => (prev ? { ...prev, repeatColor: color } : prev))}
                        className={cn(
                          "h-7 w-7 rounded-full border-2",
                          selected ? "border-zinc-900 ring-2 ring-zinc-400" : "border-zinc-300"
                        )}
                        style={{ backgroundColor: color }}
                        aria-label={`색상 ${color}`}
                      >
                        {selected ? <Check className="m-auto h-3 w-3 text-white" /> : null}
                      </button>
                    );
                  })}

                  <input
                    type="color"
                    value={detailDraft.repeatColor}
                    onChange={(event) => setDetailDraft((prev) => (prev ? { ...prev, repeatColor: event.target.value } : prev))}
                    className="h-8 w-10 cursor-pointer rounded border-2 border-zinc-900 bg-white"
                    aria-label="사용자 지정 색상"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <Button type="button" variant="danger" size="sm" onClick={onDeleteTodo}>
                  <Trash2 className="h-4 w-4" />
                  삭제
                </Button>

                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={closeDetail}>
                    취소
                  </Button>
                  <Button type="submit" size="sm" disabled={!detailDraft.title.trim()}>
                    저장
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
