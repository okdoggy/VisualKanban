"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderKanban } from "lucide-react";
import { toast } from "sonner";
import { FeatureAccessDenied } from "@/components/app/feature-access";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { canRead, canWrite } from "@/lib/permissions/roles";
import { getCurrentUser, getEffectiveRoleForFeature, useVisualKanbanStore } from "@/lib/store";
import type { WhiteboardSceneData } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { useShallow } from "zustand/react/shallow";

const WhiteboardCanvas = dynamic(() => import("@/components/app/whiteboard-canvas").then((mod) => mod.WhiteboardCanvas), {
  ssr: false
});

const TOOLBAR_CONTROL_CLASS =
  "border-2 border-zinc-900 shadow-[2px_2px_0_0_rgb(24,24,27)] transition-[transform,box-shadow,background-color,border-color,color] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-none active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none dark:border-zinc-100 dark:shadow-[2px_2px_0_0_rgb(0,0,0)]";
const NEO_CARD_CLASS =
  "rounded-2xl border-2 border-zinc-900 bg-white shadow-[4px_4px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[4px_4px_0_0_rgb(0,0,0)]";

function readParam(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return "";
}

function initials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

export default function WhiteboardPage() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = readParam(params.projectId);

  const [projectPopupOpen, setProjectPopupOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const projectPopupRef = useRef<HTMLDivElement>(null);

  const { users, currentUserId, projects, projectMemberships, permissions, connectedUserIds, addProject, whiteboardScenes, saveWhiteboardScene } =
    useVisualKanbanStore(
      useShallow((state) => ({
        users: state.users,
        currentUserId: state.currentUserId,
        projects: state.projects,
        projectMemberships: state.projectMemberships,
        permissions: state.permissions,
        connectedUserIds: state.connectedUserIds,
        addProject: state.addProject,
        whiteboardScenes: state.whiteboardScenes,
        saveWhiteboardScene: state.saveWhiteboardScene
      }))
    );

  const currentUser = useMemo(() => getCurrentUser(users, currentUserId), [users, currentUserId]);
  const project = useMemo(() => projects.find((item) => item.id === projectId) ?? null, [projects, projectId]);

  const whiteboardRole = useMemo(
    () =>
      getEffectiveRoleForFeature({
        user: currentUser,
        projectId,
        feature: "mindmap",
        permissions,
        projectMemberships,
        projects
      }),
    [currentUser, permissions, projectId, projectMemberships, projects]
  );

  const canEditWhiteboard = useMemo(() => {
    if (!currentUser) return false;
    if (!canRead(whiteboardRole)) return false;
    return canWrite(whiteboardRole);
  }, [currentUser, whiteboardRole]);

  const canCreateProject = useMemo(() => {
    if (!currentUser) return false;
    return currentUser.baseRole === "admin" || currentUser.baseRole === "editor";
  }, [currentUser]);

  const scene = useMemo(() => whiteboardScenes.find((item) => item.projectId === projectId) ?? null, [projectId, whiteboardScenes]);

  const participants = useMemo(
    () =>
      connectedUserIds
        .map((id) => users.find((user) => user.id === id))
        .filter((user): user is (typeof users)[number] => Boolean(user))
        .map((user) => ({
          id: user.id,
          name: user.displayName,
          icon: (user.icon ?? initials(user.displayName)).slice(0, 4),
          isCurrentUser: currentUserId === user.id,
          isEditing: canWrite(
            getEffectiveRoleForFeature({
              user,
              projectId,
              feature: "mindmap",
              permissions,
              projectMemberships,
              projects
            })
          )
        })),
    [connectedUserIds, currentUserId, permissions, projectId, projectMemberships, projects, users]
  );

  useEffect(() => {
    if (!projectPopupOpen) return;

    const onClickAway = (event: MouseEvent) => {
      if (!projectPopupRef.current?.contains(event.target as Node)) {
        setProjectPopupOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProjectPopupOpen(false);
      }
    };

    window.addEventListener("mousedown", onClickAway);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("mousedown", onClickAway);
      window.removeEventListener("keydown", onEscape);
    };
  }, [projectPopupOpen]);

  const handleSelectProject = useCallback(
    (nextProjectId: string) => {
      if (!nextProjectId || nextProjectId === projectId) {
        setProjectPopupOpen(false);
        return;
      }
      router.push(`/app/projects/${nextProjectId}/whiteboard`);
      setProjectPopupOpen(false);
      toast.success("프로젝트를 변경했습니다.");
    },
    [projectId, router]
  );

  const handleAddProject = useCallback(() => {
    if (!canCreateProject) {
      toast.warning("Viewer 권한은 프로젝트를 추가할 수 없습니다.");
      return;
    }

    const name = newProjectName.trim();
    if (!name) {
      toast.error("프로젝트명을 입력해 주세요.");
      return;
    }

    const result = addProject({ name, description: "" });
    if (!result.ok || !result.projectId) {
      toast.error(result.reason ?? "프로젝트 추가에 실패했습니다.");
      return;
    }

    setNewProjectName("");
    setProjectPopupOpen(false);
    toast.success(`"${name}" 프로젝트를 추가했습니다.`);
    router.push(`/app/projects/${result.projectId}/whiteboard`);
  }, [addProject, canCreateProject, newProjectName, router]);

  const handleSceneChange = useCallback(
    (nextScene: WhiteboardSceneData) => {
      const result = saveWhiteboardScene(projectId, nextScene);
      if (!result.ok && result.reason) {
        toast.error(result.reason);
      }
    },
    [projectId, saveWhiteboardScene]
  );

  if (!canRead(whiteboardRole)) {
    return <FeatureAccessDenied feature="Whiteboard" />;
  }

  if (!project) {
    return (
      <Card className={NEO_CARD_CLASS}>
        <CardTitle>프로젝트를 찾을 수 없습니다.</CardTitle>
        <CardDescription className="mt-1">잘못된 프로젝트 ID입니다: {projectId}</CardDescription>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <div className="relative flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-zinc-900 bg-white px-2.5 py-2 shadow-[3px_3px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[3px_3px_0_0_rgb(0,0,0)]">
        <Button
          size="sm"
          variant={projectPopupOpen ? "secondary" : "outline"}
          className={cn("h-7 max-w-[260px] gap-1 px-2 text-xs", TOOLBAR_CONTROL_CLASS)}
          onClick={() => setProjectPopupOpen((previous) => !previous)}
          title="프로젝트 선택/추가"
          aria-label="프로젝트 선택/추가"
        >
          <FolderKanban className="h-3.5 w-3.5" />
          <span className="truncate">{project.name}</span>
        </Button>

        {projectPopupOpen ? (
          <div
            ref={projectPopupRef}
            className="absolute left-0 top-full z-40 mt-2 w-[340px] rounded-2xl border-2 border-zinc-900 bg-white p-3 shadow-[6px_6px_0_0_rgb(24,24,27)] dark:border-zinc-100 dark:bg-zinc-900 dark:shadow-[6px_6px_0_0_rgb(0,0,0)]"
          >
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">프로젝트 목록</p>
            <div className="mt-2 max-h-40 space-y-2 overflow-auto pr-1">
              {projects.map((candidate) => {
                const active = candidate.id === projectId;
                return (
                  <Button
                    key={candidate.id}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-8 w-full justify-start gap-2 px-2 text-xs"
                    onClick={() => handleSelectProject(candidate.id)}
                  >
                    <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{candidate.name}</span>
                  </Button>
                );
              })}
            </div>

            <div className="mt-3 border-t-2 border-zinc-200 pt-3 dark:border-zinc-700">
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">프로젝트 추가</p>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder="프로젝트명"
                  className="h-8 text-xs"
                />
                <Button type="button" size="sm" className="h-8 px-2 text-xs" onClick={handleAddProject} disabled={!canCreateProject}>
                  추가
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Card className={`${NEO_CARD_CLASS} h-[80vh] overflow-hidden p-0`}>
        <WhiteboardCanvas
          projectId={projectId}
          readOnly={!canEditWhiteboard}
          initialScene={scene?.scene ?? null}
          participants={participants}
          onSceneChange={handleSceneChange}
        />
      </Card>
    </section>
  );
}
