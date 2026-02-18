"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KanbanSquare, LayoutDashboard, ListTodo, LogOut, PenTool, Search, User, Waypoints, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentUser, useVisualKanbanStore } from "@/lib/store";
import type { WorkspaceLanguage, WorkspaceStyle } from "@/lib/types";
import { useShallow } from "zustand/react/shallow";

const nav = [
  { href: "/app/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/app/todo", labelKey: "todo", icon: ListTodo },
  { href: "/app/projects/proj-visual/whiteboard", labelKey: "whiteboard", icon: PenTool },
  { href: "/app/projects/proj-visual/kanban", labelKey: "kanban", icon: KanbanSquare },
  { href: "/app/projects/proj-visual/gantt", labelKey: "gantt", icon: Waypoints }
] as const;

const styleOptions: WorkspaceStyle[] = ["neo-classic", "neo-vivid"];

const shellStyleClasses: Record<WorkspaceStyle, { page: string; sidebar: string; header: string; searchDialog: string }> = {
  "neo-classic": {
    page: "bg-zinc-100 dark:bg-zinc-950",
    sidebar: "bg-amber-200 dark:bg-zinc-900",
    header: "bg-sky-200 dark:bg-zinc-900",
    searchDialog: "bg-amber-100 dark:bg-zinc-900"
  },
  "neo-vivid": {
    page: "bg-zinc-100 dark:bg-zinc-950",
    sidebar: "bg-lime-200 dark:bg-zinc-900",
    header: "bg-cyan-200 dark:bg-zinc-900",
    searchDialog: "bg-lime-100 dark:bg-zinc-900"
  }
};

type ShellNavLabelKey = (typeof nav)[number]["labelKey"];
type ShellTabLabels = {
  gantt: string;
  kanban: string;
  whiteboard: string;
  permissions: string;
  taskDetail: string;
  dashboard: string;
  todo: string;
  search: string;
  comments: string;
  adminUsers: string;
  adminAudit: string;
  fallback: string;
};

type ShellCopy = {
  workspace: string;
  currentView: string;
  settings: string;
  style: string;
  language: string;
  nav: Record<ShellNavLabelKey, string>;
  tabs: ShellTabLabels;
  languageOptions: Record<WorkspaceLanguage, string>;
  styleOptions: Record<WorkspaceStyle, string>;
  searchTitle: string;
  searchPlaceholder: string;
  searchButton: string;
  searchHint: string;
  openSearch: string;
  closeSearch: string;
  accountMenu: string;
  myAccount: string;
  role: string;
  iconEdit: string;
  iconPlaceholder: string;
  save: string;
  iconSaveSuccess: string;
  iconSaveFailed: string;
  logout: string;
};

const shellCopyByLanguage: Record<WorkspaceLanguage, ShellCopy> = {
  ko: {
    workspace: "워크스페이스",
    currentView: "현재 화면",
    settings: "워크스페이스 설정",
    style: "스타일",
    language: "언어",
    nav: {
      dashboard: "대시보드",
      todo: "할 일",
      whiteboard: "화이트보드",
      kanban: "칸반 보드",
      gantt: "간트 차트"
    },
    tabs: {
      gantt: "간트 차트",
      kanban: "칸반 보드",
      whiteboard: "화이트보드",
      permissions: "권한 설정",
      taskDetail: "태스크 상세",
      dashboard: "대시보드",
      todo: "할 일",
      search: "검색",
      comments: "댓글",
      adminUsers: "사용자 관리",
      adminAudit: "감사 로그",
      fallback: "VisualKanban"
    },
    languageOptions: {
      ko: "한국어",
      en: "English"
    },
    styleOptions: {
      "neo-classic": "네오 클래식",
      "neo-vivid": "네오 비비드"
    },
    searchTitle: "글로벌 검색",
    searchPlaceholder: "검색어를 입력하세요 (⌘/Ctrl + K)",
    searchButton: "검색",
    searchHint: "Enter로 검색, Esc로 닫기, ⌘/Ctrl + K로 언제든 열 수 있습니다.",
    openSearch: "글로벌 검색 열기",
    closeSearch: "글로벌 검색 닫기",
    accountMenu: "내 계정 메뉴 열기",
    myAccount: "내 계정",
    role: "역할",
    iconEdit: "아이콘 편집",
    iconPlaceholder: "예: K, 👩‍💻",
    save: "저장",
    iconSaveSuccess: "계정 아이콘이 저장되었습니다.",
    iconSaveFailed: "아이콘 저장에 실패했습니다.",
    logout: "로그아웃"
  },
  en: {
    workspace: "Workspace",
    currentView: "Current view",
    settings: "Workspace settings",
    style: "Style",
    language: "Language",
    nav: {
      dashboard: "Dashboard",
      todo: "To do",
      whiteboard: "Whiteboard",
      kanban: "Kanban board",
      gantt: "Gantt chart"
    },
    tabs: {
      gantt: "Gantt chart",
      kanban: "Kanban board",
      whiteboard: "Whiteboard",
      permissions: "Permissions",
      taskDetail: "Task detail",
      dashboard: "Dashboard",
      todo: "To do",
      search: "Search",
      comments: "Comments",
      adminUsers: "User management",
      adminAudit: "Audit log",
      fallback: "VisualKanban"
    },
    languageOptions: {
      ko: "한국어",
      en: "English"
    },
    styleOptions: {
      "neo-classic": "Neo Classic",
      "neo-vivid": "Neo Vivid"
    },
    searchTitle: "Global search",
    searchPlaceholder: "Type to search (⌘/Ctrl + K)",
    searchButton: "Search",
    searchHint: "Press Enter to search, Esc to close, and ⌘/Ctrl + K to open anytime.",
    openSearch: "Open global search",
    closeSearch: "Close global search",
    accountMenu: "Open account menu",
    myAccount: "My account",
    role: "Role",
    iconEdit: "Edit icon",
    iconPlaceholder: "e.g. K, 👩‍💻",
    save: "Save",
    iconSaveSuccess: "Account icon saved.",
    iconSaveFailed: "Failed to save account icon.",
    logout: "Log out"
  }
};

function initials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function getTabLabel(pathname: string, tabs: ShellTabLabels) {
  if (pathname.startsWith("/app/projects/") && pathname.includes("/gantt")) return tabs.gantt;
  if (pathname.startsWith("/app/projects/") && pathname.includes("/kanban")) return tabs.kanban;
  if (pathname.startsWith("/app/projects/") && pathname.includes("/whiteboard")) return tabs.whiteboard;
  if (pathname.startsWith("/app/projects/") && pathname.includes("/mindmap")) return tabs.whiteboard;
  if (pathname.startsWith("/app/projects/") && pathname.includes("/permissions")) return tabs.permissions;
  if (pathname.startsWith("/app/projects/") && pathname.includes("/tasks/")) return tabs.taskDetail;
  if (pathname === "/app/dashboard") return tabs.dashboard;
  if (pathname === "/app/todo") return tabs.todo;
  if (pathname === "/app/search") return tabs.search;
  if (pathname === "/app/comments") return tabs.comments;
  if (pathname === "/app/admin/users") return tabs.adminUsers;
  if (pathname === "/app/admin/audit") return tabs.adminAudit;
  return tabs.fallback;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [globalSearch, setGlobalSearch] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [iconDraft, setIconDraft] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const {
    users,
    currentUserId,
    connectedUserIds,
    logout,
    ensureSessionCheck,
    updateMyIcon,
    workspaceLanguage,
    workspaceStyle,
    setWorkspaceLanguage,
    setWorkspaceStyle
  } = useVisualKanbanStore(
    useShallow((state) => ({
      users: state.users,
      currentUserId: state.currentUserId,
      connectedUserIds: state.connectedUserIds,
      logout: state.logout,
      ensureSessionCheck: state.ensureSessionCheck,
      updateMyIcon: state.updateMyIcon,
      workspaceLanguage: state.workspaceLanguage,
      workspaceStyle: state.workspaceStyle,
      setWorkspaceLanguage: state.setWorkspaceLanguage,
      setWorkspaceStyle: state.setWorkspaceStyle
    }))
  );

  const shellCopy = useMemo(() => shellCopyByLanguage[workspaceLanguage], [workspaceLanguage]);
  const activeStyle = useMemo(() => shellStyleClasses[workspaceStyle], [workspaceStyle]);
  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);
  const currentTabLabel = useMemo(() => getTabLabel(pathname, shellCopy.tabs), [pathname, shellCopy]);
  const connectedUsers = useMemo(
    () => connectedUserIds.map((id) => users.find((user) => user.id === id)).filter((user): user is (typeof users)[number] => Boolean(user)),
    [connectedUserIds, users]
  );

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    window.requestAnimationFrame(() => {
      searchTriggerRef.current?.focus();
    });
  }, []);

  const submitGlobalSearch = useCallback(() => {
    const query = globalSearch.trim();

    if (!query) {
      return;
    }

    closeSearch();
    router.push(`/app/search?q=${encodeURIComponent(query)}`);
  }, [closeSearch, globalSearch, router]);

  const saveMyIcon = useCallback(() => {
    const result = updateMyIcon(iconDraft);
    if (!result.ok) {
      toast.error(result.reason ?? shellCopy.iconSaveFailed);
      return;
    }
    toast.success(shellCopy.iconSaveSuccess);
  }, [iconDraft, shellCopy.iconSaveFailed, shellCopy.iconSaveSuccess, updateMyIcon]);

  useEffect(() => {
    ensureSessionCheck();
  }, [ensureSessionCheck]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const isSearchShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";

      if (isSearchShortcut) {
        event.preventDefault();
        setIsAccountMenuOpen(false);
        setIsSearchOpen(true);
      }
    };

    window.addEventListener("keydown", onShortcut);

    return () => {
      window.removeEventListener("keydown", onShortcut);
    };
  }, []);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    searchInputRef.current?.focus();
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
      }
    };

    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("keydown", onEscape);
    };
  }, [closeSearch, isSearchOpen]);

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    const onClickAway = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAccountMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onClickAway);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("mousedown", onClickAway);
      window.removeEventListener("keydown", onEscape);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (!currentUser) {
      router.replace("/login");
      return;
    }

    if (currentUser.mustChangePassword) {
      router.replace("/auth/change-password");
    }
  }, [currentUser, router]);

  if (!currentUser || currentUser.mustChangePassword) {
    return null;
  }

  const topBarIconButtonClass =
    "h-9 w-9 rounded-none border-2 border-zinc-900 bg-white text-zinc-900 shadow-[3px_3px_0_0_#18181b] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-[3px_3px_0_0_#f4f4f5] dark:hover:shadow-[2px_2px_0_0_#f4f4f5]";

  return (
    <div className={`min-h-screen p-3 sm:p-4 ${activeStyle.page}`}>
      <div className="flex min-h-[calc(100vh-1.5rem)] gap-4">
        <aside
          className={`sticky top-3 hidden h-[calc(100vh-1.5rem)] w-72 shrink-0 flex-col border-4 border-zinc-900 p-4 shadow-[8px_8px_0_0_#18181b] xl:flex dark:border-zinc-100 dark:shadow-[8px_8px_0_0_#f4f4f5] ${activeStyle.sidebar}`}
        >
          <div className="mb-6 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-700 dark:text-zinc-300">{shellCopy.workspace}</p>
            <h2 className="text-2xl font-black uppercase tracking-tight text-zinc-900 dark:text-zinc-50">VisualKanban</h2>
          </div>
          <nav className="space-y-2">
            {nav.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 border-2 px-3 py-2 text-sm font-bold uppercase tracking-wide transition ${
                    active
                      ? "border-zinc-900 bg-lime-300 text-zinc-900 shadow-[4px_4px_0_0_#18181b] dark:border-zinc-100 dark:bg-lime-400 dark:text-zinc-950 dark:shadow-[4px_4px_0_0_#f4f4f5]"
                      : "border-zinc-900/80 bg-white text-zinc-900 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[4px_4px_0_0_#18181b] dark:border-zinc-200 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:shadow-[4px_4px_0_0_#f4f4f5]"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{shellCopy.nav[item.labelKey]}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-3 border-[3px] border-zinc-900 bg-white p-3 shadow-[5px_5px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-950 dark:shadow-[5px_5px_0_0_#f4f4f5]">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-300">{shellCopy.settings}</p>
            <div className="space-y-1">
              <label htmlFor="workspace-style-select" className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-700 dark:text-zinc-300">
                {shellCopy.style}
              </label>
              <select
                id="workspace-style-select"
                value={workspaceStyle}
                onChange={(event) => setWorkspaceStyle(event.target.value as WorkspaceStyle)}
                className="h-9 w-full rounded-none border-2 border-zinc-900 bg-white px-2 text-xs font-bold text-zinc-900 dark:border-zinc-100 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {styleOptions.map((styleOption) => (
                  <option key={styleOption} value={styleOption}>
                    {shellCopy.styleOptions[styleOption]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="workspace-language-select" className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-700 dark:text-zinc-300">
                {shellCopy.language}
              </label>
              <select
                id="workspace-language-select"
                value={workspaceLanguage}
                onChange={(event) => setWorkspaceLanguage(event.target.value as WorkspaceLanguage)}
                className="h-9 w-full rounded-none border-2 border-zinc-900 bg-white px-2 text-xs font-bold text-zinc-900 dark:border-zinc-100 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {(Object.keys(shellCopy.languageOptions) as WorkspaceLanguage[]).map((languageCode) => (
                  <option key={languageCode} value={languageCode}>
                    {shellCopy.languageOptions[languageCode]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-4">
          <header
            className={`mb-5 border-4 border-zinc-900 px-4 py-3 shadow-[8px_8px_0_0_#18181b] dark:border-zinc-100 dark:shadow-[8px_8px_0_0_#f4f4f5] ${activeStyle.header}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-700 dark:text-zinc-300">{shellCopy.currentView}</p>
                <h1 className="truncate text-base font-black uppercase tracking-wide text-zinc-900 md:text-lg dark:text-zinc-50">{currentTabLabel}</h1>
              </div>

              <div className="flex items-center gap-2">
                {connectedUsers.map((user) => (
                  <span
                    key={`connected-user-${user.id}`}
                    title={`${user.displayName} (${user.username})`}
                    className="inline-flex h-8 min-w-8 items-center justify-center border-2 border-zinc-900 bg-amber-100 px-1 text-[10px] font-black text-zinc-900 shadow-[2px_2px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-800 dark:text-zinc-100 dark:shadow-[2px_2px_0_0_#f4f4f5]"
                  >
                    {(user.icon ?? initials(user.displayName)).slice(0, 4)}
                  </span>
                ))}

                <Button
                  ref={searchTriggerRef}
                  variant="ghost"
                  size="icon"
                  className={topBarIconButtonClass}
                  aria-label={shellCopy.openSearch}
                  aria-controls="global-search-dialog"
                  aria-expanded={isSearchOpen}
                  aria-haspopup="dialog"
                  onClick={() => {
                    setIsAccountMenuOpen(false);
                    setIsSearchOpen(true);
                  }}
                >
                  <Search className="h-4 w-4" />
                </Button>

                <div ref={accountMenuRef} className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={topBarIconButtonClass}
                    aria-label={shellCopy.accountMenu}
                    aria-haspopup="menu"
                    aria-expanded={isAccountMenuOpen}
                    onClick={() =>
                      setIsAccountMenuOpen((prev) => {
                        const next = !prev;
                        if (next) {
                          setIconDraft(currentUser.icon ?? initials(currentUser.displayName));
                        }
                        return next;
                      })
                    }
                  >
                    <User className="h-4 w-4" />
                  </Button>
                  {isAccountMenuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-72 border-4 border-zinc-900 bg-white p-3 shadow-[7px_7px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[7px_7px_0_0_#f4f4f5]"
                    >
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-300">{shellCopy.myAccount}</p>
                      <p className="mt-1 text-sm font-black text-zinc-900 dark:text-zinc-100">{currentUser.displayName}</p>
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">@{currentUser.username}</p>
                      <p className="mt-2 border-l-2 border-zinc-900 pl-2 text-xs font-semibold text-zinc-700 dark:border-zinc-100 dark:text-zinc-300">
                        {shellCopy.role}: {currentUser.baseRole.toUpperCase()}
                      </p>

                      <div className="mt-3 space-y-1.5 border-2 border-zinc-900 bg-zinc-100 p-2 dark:border-zinc-100 dark:bg-zinc-950">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-600 dark:text-zinc-300">{shellCopy.iconEdit}</p>
                        <div className="flex items-center gap-2">
                          <Input
                            value={iconDraft}
                            onChange={(event) => setIconDraft(event.target.value)}
                            maxLength={4}
                            className="h-9 rounded-none border-2 border-zinc-900 bg-white text-xs font-semibold text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-100 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                            placeholder={shellCopy.iconPlaceholder}
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-9 rounded-none border-2 border-zinc-900 bg-lime-300 px-3 text-xs font-black text-zinc-900 shadow-[3px_3px_0_0_#18181b] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#18181b] dark:border-zinc-100 dark:bg-lime-400 dark:text-zinc-950 dark:shadow-[3px_3px_0_0_#f4f4f5] dark:hover:shadow-[2px_2px_0_0_#f4f4f5]"
                            onClick={saveMyIcon}
                          >
                            {shellCopy.save}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className={topBarIconButtonClass}
                  aria-label={shellCopy.logout}
                  onClick={() => {
                    setIsAccountMenuOpen(false);
                    logout();
                    router.push("/login");
                  }}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          {isSearchOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/55 px-4 pt-20"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  closeSearch();
                }
              }}
            >
              <div
                id="global-search-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="global-search-title"
                className={`w-full max-w-2xl border-4 border-zinc-900 p-4 shadow-[10px_10px_0_0_#18181b] dark:border-zinc-100 dark:shadow-[10px_10px_0_0_#f4f4f5] ${activeStyle.searchDialog}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 id="global-search-title" className="text-sm font-black uppercase tracking-[0.18em] text-zinc-900 dark:text-zinc-100">
                    {shellCopy.searchTitle}
                  </h2>
                  <Button variant="ghost" size="icon" className={topBarIconButtonClass} aria-label={shellCopy.closeSearch} onClick={closeSearch}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-3 flex gap-2">
                  <Input
                    ref={searchInputRef}
                    value={globalSearch}
                    onChange={(event) => setGlobalSearch(event.target.value)}
                    className="h-10 rounded-none border-2 border-zinc-900 bg-white text-sm font-semibold text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    placeholder={shellCopy.searchPlaceholder}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        closeSearch();
                      }

                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitGlobalSearch();
                      }
                    }}
                  />
                  <Button
                    onClick={submitGlobalSearch}
                    disabled={!globalSearch.trim()}
                    className="rounded-none border-2 border-zinc-900 bg-lime-300 font-black text-zinc-900 shadow-[4px_4px_0_0_#18181b] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_#18181b] dark:border-zinc-100 dark:bg-lime-400 dark:text-zinc-950 dark:shadow-[4px_4px_0_0_#f4f4f5] dark:hover:shadow-[3px_3px_0_0_#f4f4f5]"
                  >
                    <Search className="h-4 w-4" />
                    {shellCopy.searchButton}
                  </Button>
                </div>
                <p className="mt-3 border-t-2 border-zinc-900 pt-2 text-xs font-medium text-zinc-700 dark:border-zinc-100 dark:text-zinc-300">
                  {shellCopy.searchHint}
                </p>
              </div>
            </div>
          ) : null}

          <div className="border-4 border-zinc-900 bg-white p-4 shadow-[8px_8px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-950 dark:shadow-[8px_8px_0_0_#f4f4f5] lg:p-5">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
