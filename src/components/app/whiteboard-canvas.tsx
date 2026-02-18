"use client";

import "@excalidraw/excalidraw/index.css";

import { CaptureUpdateAction, Excalidraw } from "@excalidraw/excalidraw";
import type { BinaryFiles, Collaborator, ExcalidrawImperativeAPI, SocketId } from "@excalidraw/excalidraw/types";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { WhiteboardSceneData } from "@/lib/types";

interface WhiteboardParticipant {
  id: string;
  name: string;
  icon: string;
  isCurrentUser: boolean;
  isEditing: boolean;
}

const collaboratorPalette = [
  { background: "#e0f2fe", stroke: "#0ea5e9" },
  { background: "#dcfce7", stroke: "#22c55e" },
  { background: "#ede9fe", stroke: "#8b5cf6" },
  { background: "#ffedd5", stroke: "#f97316" },
  { background: "#fee2e2", stroke: "#ef4444" },
  { background: "#fef9c3", stroke: "#eab308" }
];

function pickCollaboratorColor(index: number) {
  return collaboratorPalette[index % collaboratorPalette.length] ?? collaboratorPalette[0];
}

function normalizeFiles(input: WhiteboardSceneData["files"]) {
  if (!input || typeof input !== "object") return {};
  return input as BinaryFiles;
}

export function WhiteboardCanvas({
  projectId,
  readOnly,
  initialScene,
  participants,
  onSceneChange
}: {
  projectId: string;
  readOnly: boolean;
  initialScene: WhiteboardSceneData | null;
  participants: WhiteboardParticipant[];
  onSceneChange: (scene: WhiteboardSceneData) => void;
}) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const collaborators = useMemo(() => {
    const entries: Array<[SocketId, Collaborator]> = participants.map((participant, index) => {
      const color = pickCollaboratorColor(index);
      const socketId = `socket-${participant.id}` as SocketId;
      return [
        socketId,
        {
          id: participant.id,
          socketId,
          username: participant.name,
          isCurrentUser: participant.isCurrentUser,
          color
        }
      ];
    });

    return new Map(entries);
  }, [participants]);

  useEffect(() => {
    if (!apiRef.current) return;
    apiRef.current.updateScene({
      collaborators,
      captureUpdate: CaptureUpdateAction.NEVER
    });
  }, [collaborators]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const initialData = useMemo(() => {
    const appStateBase = initialScene?.appState && typeof initialScene.appState === "object" ? initialScene.appState : {};
    return {
      elements: Array.isArray(initialScene?.elements) ? initialScene?.elements : [],
      appState: {
        ...appStateBase,
        viewModeEnabled: readOnly,
        collaborators
      },
      files: normalizeFiles(initialScene?.files ?? null)
    } as const;
  }, [collaborators, initialScene, readOnly]);

  const handleChange = useCallback(
    (elements: readonly unknown[], appState: Record<string, unknown>, files: BinaryFiles) => {
      if (readOnly) return;

      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = window.setTimeout(() => {
        onSceneChange({
          elements: [...elements],
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
            zoom: appState.zoom,
            gridSize: appState.gridSize,
            gridModeEnabled: appState.gridModeEnabled
          },
          files: files ?? {}
        });
      }, 420);
    },
    [onSceneChange, readOnly]
  );

  return (
    <div className="relative h-full w-full">
      <div className="absolute right-3 top-3 z-20 flex flex-wrap items-center justify-end gap-1.5">
        {participants.filter((participant) => participant.isEditing).map((participant) => (
          <span
            key={`wb-participant-${participant.id}`}
            title={`${participant.name} 편집중`}
            className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border-2 border-zinc-900 bg-amber-100 px-1 text-[11px] font-black text-zinc-900 shadow-[2px_2px_0_0_#111827]"
          >
            {participant.icon.slice(0, 4)}
          </span>
        ))}
      </div>

      <Excalidraw
        key={projectId}
        initialData={initialData as any}
        viewModeEnabled={readOnly}
        isCollaborating={participants.length > 1}
        onChange={handleChange as any}
        excalidrawAPI={(api) => {
          apiRef.current = api;
        }}
        gridModeEnabled
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false
          }
        }}
      />
    </div>
  );
}
