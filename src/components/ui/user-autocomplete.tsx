"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const DEFAULT_RECENT_STORAGE_KEY = "visualkanban:user-autocomplete:recent-users";
const RECENT_SELECTION_LIMIT = 20;

export type UserAutocompleteOption = {
  id: string;
  label: string;
  secondaryLabel?: string;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function optionMatches(option: UserAutocompleteOption, query: string) {
  const needle = normalizeText(query);
  if (!needle) return true;

  return (
    normalizeText(option.label).includes(needle) ||
    normalizeText(option.id).includes(needle) ||
    normalizeText(option.secondaryLabel ?? "").includes(needle)
  );
}

function getMatchPriority(option: UserAutocompleteOption, query: string) {
  const needle = normalizeText(query);
  if (!needle) return 0;

  const label = normalizeText(option.label);
  const id = normalizeText(option.id);
  const secondary = normalizeText(option.secondaryLabel ?? "");

  if (label.startsWith(needle)) return 0;
  if (id.startsWith(needle)) return 1;
  if (secondary.startsWith(needle)) return 2;
  if (label.includes(needle)) return 3;
  if (secondary.includes(needle)) return 4;
  if (id.includes(needle)) return 5;
  return 6;
}

function readRecentSelections(storageKey: string) {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return [...new Set(parsed.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean))].slice(
      0,
      RECENT_SELECTION_LIMIT
    );
  } catch {
    return [];
  }
}

function writeRecentSelections(storageKey: string, recentIds: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(recentIds.slice(0, RECENT_SELECTION_LIMIT)));
  } catch {
    // ignore storage errors (private mode / quota)
  }
}

function promoteRecentSelection(recentIds: string[], id: string) {
  const normalizedId = id.trim();
  if (!normalizedId) return recentIds;
  return [normalizedId, ...recentIds.filter((recentId) => recentId !== normalizedId)].slice(0, RECENT_SELECTION_LIMIT);
}

function sortOptionsByRelevance({
  options,
  query,
  recentIds,
  maxVisibleOptions
}: {
  options: UserAutocompleteOption[];
  query: string;
  recentIds: string[];
  maxVisibleOptions: number;
}) {
  const recentRankById = new Map(recentIds.map((recentId, index) => [recentId, index]));

  return options
    .map((option, originalIndex) => ({
      option,
      originalIndex,
      matchPriority: getMatchPriority(option, query),
      recentRank: recentRankById.get(option.id) ?? Number.POSITIVE_INFINITY
    }))
    .sort((a, b) => {
      if (a.matchPriority !== b.matchPriority) {
        return a.matchPriority - b.matchPriority;
      }

      if (a.recentRank !== b.recentRank) {
        return a.recentRank - b.recentRank;
      }

      return a.originalIndex - b.originalIndex;
    })
    .slice(0, maxVisibleOptions)
    .map((entry) => entry.option);
}

function highlightMatch(text: string, query: string): ReactNode {
  const needle = normalizeText(query);
  if (!needle) return text;

  const source = text ?? "";
  const lowerSource = source.toLowerCase();
  const start = lowerSource.indexOf(needle);

  if (start < 0) return source;

  const end = start + needle.length;

  return (
    <>
      {source.slice(0, start)}
      <span className="rounded bg-amber-200/70 px-0.5 text-zinc-900 dark:bg-amber-500/30 dark:text-zinc-100">{source.slice(start, end)}</span>
      {source.slice(end)}
    </>
  );
}

function useRecentSelectionTracker(storageKey: string, enabled: boolean) {
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const loadedRef = useRef(false);

  const loadRecentIds = () => {
    if (!enabled || loadedRef.current) return;

    loadedRef.current = true;
    setRecentIds(readRecentSelections(storageKey));
  };

  const rememberSelection = (id: string) => {
    if (!enabled) return;

    setRecentIds((previous) => {
      const current = loadedRef.current ? previous : readRecentSelections(storageKey);
      loadedRef.current = true;
      const next = promoteRecentSelection(current, id);
      writeRecentSelections(storageKey, next);
      return next;
    });
  };

  return {
    recentIds,
    loadRecentIds,
    rememberSelection
  };
}

type UserAutocompleteSelectProps = {
  options: UserAutocompleteOption[];
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  panelClassName?: string;
  inputClassName?: string;
  maxVisibleOptions?: number;
  emptyText?: string;
  prioritizeRecent?: boolean;
  recentStorageKey?: string;
};

export function UserAutocompleteSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  allowClear = true,
  className,
  panelClassName,
  inputClassName,
  maxVisibleOptions = 8,
  emptyText = "일치하는 사용자가 없습니다.",
  prioritizeRecent = true,
  recentStorageKey = DEFAULT_RECENT_STORAGE_KEY
}: UserAutocompleteSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const { recentIds, loadRecentIds, rememberSelection } = useRecentSelectionTracker(recentStorageKey, prioritizeRecent);

  const selectedOption = useMemo(() => options.find((option) => option.id === value) ?? null, [options, value]);
  const inputValue = isOpen ? query : selectedOption?.label ?? "";

  const filteredOptions = useMemo(() => {
    const matchedOptions = options.filter((option) => optionMatches(option, query));

    return sortOptionsByRelevance({
      options: matchedOptions,
      query,
      recentIds: prioritizeRecent ? recentIds : [],
      maxVisibleOptions
    });
  }, [maxVisibleOptions, options, prioritizeRecent, query, recentIds]);

  const resolvedActiveIndex = filteredOptions.length === 0 ? -1 : activeIndex < 0 ? 0 : Math.min(activeIndex, filteredOptions.length - 1);
  const activeOptionId = resolvedActiveIndex >= 0 ? `${listboxId}-option-${resolvedActiveIndex}` : undefined;

  useEffect(() => {
    if (!isOpen || resolvedActiveIndex < 0) return;
    optionRefs.current[resolvedActiveIndex]?.scrollIntoView({ block: "nearest" });
  }, [isOpen, resolvedActiveIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickAway = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    window.addEventListener("mousedown", handleClickAway);
    return () => {
      window.removeEventListener("mousedown", handleClickAway);
    };
  }, [isOpen]);

  const selectOption = (option: UserAutocompleteOption) => {
    onChange(option.id);
    setQuery(option.label);
    rememberSelection(option.id);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <input
        value={inputValue}
        onChange={(event) => {
          if (disabled) return;
          loadRecentIds();
          setQuery(event.target.value);
          if (!isOpen) setIsOpen(true);
          setActiveIndex(0);

          if (allowClear && event.target.value.trim() === "") {
            onChange("");
          }
        }}
        onFocus={() => {
          if (disabled) return;
          loadRecentIds();
          setQuery(selectedOption?.label ?? "");
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setIsOpen(false);
            setActiveIndex(-1);
            setQuery(selectedOption?.label ?? "");
          }, 0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();

            if (!isOpen) {
              loadRecentIds();
              setQuery(selectedOption?.label ?? "");
              setIsOpen(true);
              setActiveIndex(0);
              return;
            }

            if (filteredOptions.length === 0) return;
            setActiveIndex((previous) => (previous < 0 ? 0 : (previous + 1) % filteredOptions.length));
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();

            if (!isOpen) {
              loadRecentIds();
              setQuery(selectedOption?.label ?? "");
              setIsOpen(true);
              setActiveIndex(0);
              return;
            }

            if (filteredOptions.length === 0) return;
            setActiveIndex((previous) => {
              if (previous < 0) return filteredOptions.length - 1;
              return (previous - 1 + filteredOptions.length) % filteredOptions.length;
            });
            return;
          }

          if (event.key === "Home") {
            if (!isOpen || filteredOptions.length === 0) return;
            event.preventDefault();
            setActiveIndex(0);
            return;
          }

          if (event.key === "End") {
            if (!isOpen || filteredOptions.length === 0) return;
            event.preventDefault();
            setActiveIndex(filteredOptions.length - 1);
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setQuery(selectedOption?.label ?? "");
            setIsOpen(false);
            setActiveIndex(-1);
            return;
          }

          if (event.key === "Enter") {
            if (!isOpen) return;
            const targetIndex = resolvedActiveIndex >= 0 ? resolvedActiveIndex : 0;
            const option = filteredOptions[targetIndex];
            if (!option) return;
            event.preventDefault();
            selectOption(option);
          }
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen ? activeOptionId : undefined}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-visible:ring-zinc-700",
          inputClassName
        )}
      />

      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          className={cn(
            "absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-zinc-300 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900",
            panelClassName
          )}
        >
          {filteredOptions.length === 0 ? (
            <p className="px-2 py-2 text-xs text-zinc-500 dark:text-zinc-400">{emptyText}</p>
          ) : (
            filteredOptions.map((option, index) => {
              const isActive = index === resolvedActiveIndex;

              return (
                <button
                  key={option.id}
                  id={`${listboxId}-option-${index}`}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={cn(
                    "w-full rounded px-2 py-1.5 text-left text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800",
                    isActive && "bg-zinc-100 ring-1 ring-zinc-300 dark:bg-zinc-800 dark:ring-zinc-600"
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectOption(option);
                  }}
                >
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{highlightMatch(option.label, query)}</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{highlightMatch(option.secondaryLabel ?? option.id, query)}</p>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

type UserAutocompleteMultiSelectProps = {
  options: UserAutocompleteOption[];
  selectedIds: string[];
  onChange: (nextSelectedIds: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  panelClassName?: string;
  chipClassName?: string;
  lockedIds?: string[];
  maxVisibleOptions?: number;
  emptyText?: string;
  prioritizeRecent?: boolean;
  recentStorageKey?: string;
};

export function UserAutocompleteMultiSelect({
  options,
  selectedIds,
  onChange,
  placeholder,
  disabled,
  className,
  inputClassName,
  panelClassName,
  chipClassName,
  lockedIds = [],
  maxVisibleOptions = 8,
  emptyText = "추가 가능한 사용자가 없습니다.",
  prioritizeRecent = true,
  recentStorageKey = DEFAULT_RECENT_STORAGE_KEY
}: UserAutocompleteMultiSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const { recentIds, loadRecentIds, rememberSelection } = useRecentSelectionTracker(recentStorageKey, prioritizeRecent);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const lockedSet = useMemo(() => new Set(lockedIds), [lockedIds]);
  const optionById = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);

  const selectableOptions = useMemo(() => {
    const matchedOptions = options.filter((option) => !selectedSet.has(option.id)).filter((option) => optionMatches(option, query));

    return sortOptionsByRelevance({
      options: matchedOptions,
      query,
      recentIds: prioritizeRecent ? recentIds : [],
      maxVisibleOptions
    });
  }, [maxVisibleOptions, options, prioritizeRecent, query, recentIds, selectedSet]);

  const resolvedActiveIndex = selectableOptions.length === 0 ? -1 : activeIndex < 0 ? 0 : Math.min(activeIndex, selectableOptions.length - 1);
  const activeOptionId = resolvedActiveIndex >= 0 ? `${listboxId}-option-${resolvedActiveIndex}` : undefined;

  useEffect(() => {
    if (!isOpen || resolvedActiveIndex < 0) return;
    optionRefs.current[resolvedActiveIndex]?.scrollIntoView({ block: "nearest" });
  }, [isOpen, resolvedActiveIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickAway = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    window.addEventListener("mousedown", handleClickAway);
    return () => {
      window.removeEventListener("mousedown", handleClickAway);
    };
  }, [isOpen]);

  const handleAdd = (id: string) => {
    if (disabled) return;
    if (selectedSet.has(id)) return;

    onChange([...selectedIds, id]);
    rememberSelection(id);
    setQuery("");
    setIsOpen(true);
    setActiveIndex(0);
  };

  const handleRemove = (id: string) => {
    if (disabled) return;
    if (lockedSet.has(id)) return;
    onChange(selectedIds.filter((currentId) => currentId !== id));
  };

  return (
    <div ref={containerRef} className={cn("space-y-2", className)}>
      <div className="relative">
        <input
          value={query}
          onChange={(event) => {
            if (disabled) return;
            loadRecentIds();
            setQuery(event.target.value);
            if (!isOpen) setIsOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => {
            if (disabled) return;
            loadRecentIds();
            setIsOpen(true);
            setActiveIndex(0);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setIsOpen(false);
              setActiveIndex(-1);
            }, 0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();

              if (!isOpen) {
                loadRecentIds();
                setIsOpen(true);
                setActiveIndex(0);
                return;
              }

              if (selectableOptions.length === 0) return;
              setActiveIndex((previous) => (previous < 0 ? 0 : (previous + 1) % selectableOptions.length));
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();

              if (!isOpen) {
                loadRecentIds();
                setIsOpen(true);
                setActiveIndex(0);
                return;
              }

              if (selectableOptions.length === 0) return;
              setActiveIndex((previous) => {
                if (previous < 0) return selectableOptions.length - 1;
                return (previous - 1 + selectableOptions.length) % selectableOptions.length;
              });
              return;
            }

            if (event.key === "Home") {
              if (!isOpen || selectableOptions.length === 0) return;
              event.preventDefault();
              setActiveIndex(0);
              return;
            }

            if (event.key === "End") {
              if (!isOpen || selectableOptions.length === 0) return;
              event.preventDefault();
              setActiveIndex(selectableOptions.length - 1);
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              setIsOpen(false);
              setActiveIndex(-1);
              return;
            }

            if (event.key === "Enter") {
              if (!isOpen) return;
              const targetIndex = resolvedActiveIndex >= 0 ? resolvedActiveIndex : 0;
              const firstOption = selectableOptions[targetIndex];
              if (!firstOption) return;
              event.preventDefault();
              handleAdd(firstOption.id);
            }
          }}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={isOpen ? activeOptionId : undefined}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            "h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-visible:ring-zinc-700",
            inputClassName
          )}
        />

        {isOpen ? (
          <div
            id={listboxId}
            role="listbox"
            className={cn(
              "absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-zinc-300 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900",
              panelClassName
            )}
          >
            {selectableOptions.length === 0 ? (
              <p className="px-2 py-2 text-xs text-zinc-500 dark:text-zinc-400">{emptyText}</p>
            ) : (
              selectableOptions.map((option, index) => {
                const isActive = index === resolvedActiveIndex;

                return (
                  <button
                    key={option.id}
                    id={`${listboxId}-option-${index}`}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={cn(
                      "w-full rounded px-2 py-1.5 text-left text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800",
                      isActive && "bg-zinc-100 ring-1 ring-zinc-300 dark:bg-zinc-800 dark:ring-zinc-600"
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleAdd(option.id);
                    }}
                  >
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{highlightMatch(option.label, query)}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{highlightMatch(option.secondaryLabel ?? option.id, query)}</p>
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {selectedIds.length === 0 ? (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">선택된 사용자가 없습니다.</span>
        ) : (
          selectedIds.map((id) => {
            const option = optionById.get(id);
            const label = option?.label ?? id;
            const locked = lockedSet.has(id);

            return (
              <span
                key={`selected-user-${id}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200",
                  locked && "border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
                  chipClassName
                )}
              >
                {label}
                {locked ? <span className="text-[10px] opacity-70">(담당)</span> : null}
                <button
                  type="button"
                  disabled={disabled || locked}
                  onClick={() => handleRemove(id)}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                  aria-label={`${label} 제거`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}
