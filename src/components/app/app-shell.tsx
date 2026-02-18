"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KanbanSquare, LayoutDashboard, ListTodo, LogOut, PenTool, Search, Table2, User, Waypoints, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentUser, useVisualKanbanStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

const nav = [
  { href: "/app/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/app/todo", label: "To do", icon: ListTodo },
  { href: "/app/projects/proj-visual/whiteboard", label: "WhiteBoard", icon: PenTool },
  { href: "/app/projects/proj-visual/kanban", label: "칸반보드", icon: KanbanSquare },
  { href: "/app/projects/proj-visual/gantt", label: "간트차트", icon: Waypoints },
  { href: "/app/projects/proj-visual/board", label: "테스크 보드", icon: Table2 }
];

function initials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function getTabLabel(pathname: string) {
  if (pathname.startsWith("/app/projects/") && pathname.includes("/gantt")) return "간트 차트";
  if (pathname.startsWith("/app/projects/") && pathname.includes("/kanban")) return "칸반 보드";
  if (pathname.startsWith("/app/projects/") && pathname.includes("/whiteboard")) return "화이트보드";
  if (pathname.startsWith("/app/projects/") && pathname.includes("/mindmap")) return "화이트보드";
  if (pathname.startsWith("/app/projects/") && pathname.includes("/board")) return "테스크 보드";
  if (pathname.startsWith("/app/projects/") && pathname.includes("/permissions")) return "권한 설정";
  if (pathname.startsWith("/app/projects/") && pathname.includes("/tasks/")) return "테스크 상세";
  if (pathname === "/app/dashboard") return "대시보드";
  if (pathname === "/app/todo") return "To do";
  if (pathname === "/app/search") return "검색";
  if (pathname === "/app/comments") return "댓글";
  if (pathname === "/app/admin/users") return "사용자 관리";
  if (pathname === "/app/admin/audit") return "감사 로그";
  return "VisualKanban";
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

  const { users, currentUserId, connectedUserIds, logout, ensureSessionCheck, updateMyIcon } = useVisualKanbanStore(useShallow((state) => ({
    users: state.users,
    currentUserId: state.currentUserId,
    connectedUserIds: state.connectedUserIds,
    logout: state.logout,
    ensureSessionCheck: state.ensureSessionCheck,
    updateMyIcon: state.updateMyIcon
  })));

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);
  const currentTabLabel = useMemo(() => getTabLabel(pathname), [pathname]);
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
      toast.error(result.reason ?? "아이콘 저장에 실패했습니다.");
      return;
    }
    toast.success("계정 아이콘이 저장되었습니다.");
  }, [iconDraft, updateMyIcon]);

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
    <div className="min-h-screen bg-zinc-100 p-3 dark:bg-zinc-950 sm:p-4">
      <div className="flex min-h-[calc(100vh-1.5rem)] gap-4">
        <aside className="sticky top-3 hidden h-[calc(100vh-1.5rem)] w-72 shrink-0 flex-col border-4 border-zinc-900 bg-amber-200 p-4 shadow-[8px_8px_0_0_#18181b] xl:flex dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[8px_8px_0_0_#f4f4f5]">
          <div className="mb-6 space-y-1">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-700 dark:text-zinc-300">Workspace</p>
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
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto space-y-2 border-[3px] border-zinc-900 bg-white p-3 shadow-[5px_5px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-950 dark:shadow-[5px_5px_0_0_#f4f4f5]">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-600 dark:text-zinc-300">로그인 상태 확인</p>
            <Badge
              variant="success"
              className="w-fit rounded-none border-2 border-zinc-900 bg-lime-300 px-2.5 py-1 text-[10px] font-black text-zinc-900 dark:border-zinc-100 dark:bg-lime-400 dark:text-zinc-950"
            >
              ACTIVE SESSION
            </Badge>
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{currentUser.displayName}</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-4">
          <header className="sticky top-3 z-20 mb-5 border-4 border-zinc-900 bg-sky-200 px-4 py-3 shadow-[8px_8px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[8px_8px_0_0_#f4f4f5]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-700 dark:text-zinc-300">Current View</p>
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
                  aria-label="글로벌 검색 열기"
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
                    aria-label="내 계정 메뉴 열기"
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
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-300">My account</p>
                      <p className="mt-1 text-sm font-black text-zinc-900 dark:text-zinc-100">{currentUser.displayName}</p>
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">@{currentUser.username}</p>
                      <p className="mt-2 border-l-2 border-zinc-900 pl-2 text-xs font-semibold text-zinc-700 dark:border-zinc-100 dark:text-zinc-300">
                        Role: {currentUser.baseRole.toUpperCase()}
                      </p>

                      <div className="mt-3 space-y-1.5 border-2 border-zinc-900 bg-zinc-100 p-2 dark:border-zinc-100 dark:bg-zinc-950">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-600 dark:text-zinc-300">아이콘 편집</p>
                        <div className="flex items-center gap-2">
                          <Input
                            value={iconDraft}
                            onChange={(event) => setIconDraft(event.target.value)}
                            maxLength={4}
                            className="h-9 rounded-none border-2 border-zinc-900 bg-white text-xs font-semibold text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-100 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                            placeholder="예: K, 👩‍💻"
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="h-9 rounded-none border-2 border-zinc-900 bg-lime-300 px-3 text-xs font-black text-zinc-900 shadow-[3px_3px_0_0_#18181b] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#18181b] dark:border-zinc-100 dark:bg-lime-400 dark:text-zinc-950 dark:shadow-[3px_3px_0_0_#f4f4f5] dark:hover:shadow-[2px_2px_0_0_#f4f4f5]"
                            onClick={saveMyIcon}
                          >
                            저장
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
                  aria-label="로그아웃"
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
                className="w-full max-w-2xl border-4 border-zinc-900 bg-amber-100 p-4 shadow-[10px_10px_0_0_#18181b] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[10px_10px_0_0_#f4f4f5]"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 id="global-search-title" className="text-sm font-black uppercase tracking-[0.18em] text-zinc-900 dark:text-zinc-100">
                    글로벌 검색
                  </h2>
                  <Button variant="ghost" size="icon" className={topBarIconButtonClass} aria-label="글로벌 검색 닫기" onClick={closeSearch}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-3 flex gap-2">
                  <Input
                    ref={searchInputRef}
                    value={globalSearch}
                    onChange={(event) => setGlobalSearch(event.target.value)}
                    className="h-10 rounded-none border-2 border-zinc-900 bg-white text-sm font-semibold text-zinc-900 placeholder:text-zinc-500 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                    placeholder="검색어를 입력하세요 (⌘/Ctrl + K)"
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
                    검색
                  </Button>
                </div>
                <p className="mt-3 border-t-2 border-zinc-900 pt-2 text-xs font-medium text-zinc-700 dark:border-zinc-100 dark:text-zinc-300">
                  Enter로 검색, Esc로 닫기, ⌘/Ctrl + K로 언제든 열 수 있습니다.
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
