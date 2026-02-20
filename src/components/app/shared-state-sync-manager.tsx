"use client";

import { useEffect, useRef } from "react";
import { getSharedStateSnapshot, useVisualKanbanStore, VISUAL_KANBAN_SHARED_SNAPSHOT_KEYS } from "@/lib/store";
import type { VisualKanbanSharedSnapshot } from "@/lib/types";

const SAVE_DEBOUNCE_MS = 900;
const SYNC_ENABLED = process.env.NEXT_PUBLIC_VK_STATE_SYNC_ENABLED !== "false";
const POLL_INTERVAL_MS = Number.parseInt(process.env.NEXT_PUBLIC_VK_STATE_SYNC_POLL_INTERVAL_MS ?? "6000", 10) || 6_000;
const SHARED_WORKSPACE_ID = process.env.NEXT_PUBLIC_VK_STATE_WORKSPACE_ID?.trim() || "main";

type PersistApi = {
  hasHydrated?: () => boolean;
  onFinishHydration?: (listener: () => void) => () => void;
};

type ParsedApiState = {
  version: number | null;
  snapshot: Partial<VisualKanbanSharedSnapshot> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toVersion(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return null;
}

function toSnapshot(value: unknown): Partial<VisualKanbanSharedSnapshot> | null {
  if (!isRecord(value)) return null;

  const hasSharedSnapshotShape = VISUAL_KANBAN_SHARED_SNAPSHOT_KEYS.some((key) => key in value);
  if (!hasSharedSnapshotShape) return null;

  return value as Partial<VisualKanbanSharedSnapshot>;
}

function parseApiStatePayload(payload: unknown): ParsedApiState {
  if (!isRecord(payload)) {
    return { version: null, snapshot: null };
  }

  const nestedData = payload.data;
  if (nestedData !== payload && isRecord(nestedData)) {
    const parsedNestedData = parseApiStatePayload(nestedData);
    if (parsedNestedData.snapshot) {
      return {
        version: parsedNestedData.version ?? toVersion(payload.version),
        snapshot: parsedNestedData.snapshot
      };
    }
  }

  const version = toVersion(payload.version);
  const wrappedSnapshot = toSnapshot(payload.snapshot) ?? toSnapshot(payload.state) ?? toSnapshot(payload.sharedState) ?? toSnapshot(payload.current);
  if (wrappedSnapshot) {
    return { version, snapshot: wrappedSnapshot };
  }

  const directSnapshot = toSnapshot(payload);
  return {
    version,
    snapshot: directSnapshot
  };
}

function serializeSnapshot(snapshot: VisualKanbanSharedSnapshot) {
  return JSON.stringify(snapshot);
}

function mergePartialSnapshot({
  currentSnapshot,
  partialSnapshot
}: {
  currentSnapshot: VisualKanbanSharedSnapshot;
  partialSnapshot: Partial<VisualKanbanSharedSnapshot>;
}): VisualKanbanSharedSnapshot {
  return {
    ...currentSnapshot,
    ...partialSnapshot
  };
}

export function SharedStateSyncManager() {
  const replaceSharedState = useVisualKanbanStore((state) => state.replaceSharedState);

  const syncReadyRef = useRef(false);
  const applyRemoteInProgressRef = useRef(false);
  const saveInProgressRef = useRef(false);
  const latestKnownVersionRef = useRef<number | null>(null);
  const latestSnapshotSerializedRef = useRef("");
  const pendingSnapshotRef = useRef<VisualKanbanSharedSnapshot | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!SYNC_ENABLED) {
      return;
    }

    let unmounted = false;
    const abortController = new AbortController();

    const clearSaveTimer = () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };

    const readResponseJson = async (response: Response) => {
      try {
        return await response.json();
      } catch {
        return null;
      }
    };

    const applyRemoteSnapshot = (remote: ParsedApiState) => {
      if (!remote.snapshot) return;

      applyRemoteInProgressRef.current = true;
      try {
        replaceSharedState(remote.snapshot);
        const nextSnapshot = getSharedStateSnapshot(useVisualKanbanStore.getState());
        latestSnapshotSerializedRef.current = serializeSnapshot(nextSnapshot);

        if (remote.version !== null) {
          latestKnownVersionRef.current = remote.version;
        }
      } finally {
        applyRemoteInProgressRef.current = false;
      }
    };

    const fetchRemoteState = async (): Promise<ParsedApiState | null> => {
      try {
        const response = await fetch(`/api/state?workspaceId=${encodeURIComponent(SHARED_WORKSPACE_ID)}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
          signal: abortController.signal
        });

        if (!response.ok) {
          return null;
        }

        const payload = await readResponseJson(response);
        const parsed = parseApiStatePayload(payload);
        return parsed.snapshot ? parsed : null;
      } catch {
        return null;
      }
    };

    const flushPendingSave = async () => {
      if (unmounted || !syncReadyRef.current || saveInProgressRef.current) {
        return;
      }

      const pendingSnapshot = pendingSnapshotRef.current;
      if (!pendingSnapshot) {
        return;
      }

      const currentUserId = useVisualKanbanStore.getState().currentUserId;
      if (!currentUserId) {
        return;
      }

      pendingSnapshotRef.current = null;
      saveInProgressRef.current = true;

      try {
        const expectedVersion = latestKnownVersionRef.current !== null && latestKnownVersionRef.current >= 0 ? latestKnownVersionRef.current : 0;
        const response = await fetch("/api/state", {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({
            workspaceId: SHARED_WORKSPACE_ID,
            expectedVersion,
            state: pendingSnapshot
          }),
          signal: abortController.signal
        });

        const payload = await readResponseJson(response);
        const parsed = parseApiStatePayload(payload);

        if (response.status === 409) {
          if (parsed.snapshot) {
            applyRemoteSnapshot(parsed);
          } else {
            const remoteState = await fetchRemoteState();
            if (remoteState?.snapshot) {
              applyRemoteSnapshot(remoteState);
            }
          }
          return;
        }

        if (!response.ok) {
          pendingSnapshotRef.current = pendingSnapshot;
          return;
        }

        if (parsed.snapshot) {
          applyRemoteSnapshot(parsed);
          return;
        }

        if (parsed.version !== null) {
          latestKnownVersionRef.current = parsed.version;
        }
        latestSnapshotSerializedRef.current = serializeSnapshot(pendingSnapshot);
      } catch {
        // Network/API failures should not break local-only behavior.
        pendingSnapshotRef.current = pendingSnapshot;
      } finally {
        saveInProgressRef.current = false;

        if (!unmounted && pendingSnapshotRef.current) {
          saveTimerRef.current = window.setTimeout(() => {
            void flushPendingSave();
          }, SAVE_DEBOUNCE_MS);
        }
      }
    };

    const scheduleSave = () => {
      if (!syncReadyRef.current) return;

      clearSaveTimer();
      saveTimerRef.current = window.setTimeout(() => {
        void flushPendingSave();
      }, SAVE_DEBOUNCE_MS);
    };

    const storeUnsubscribe = useVisualKanbanStore.subscribe((state) => {
      const snapshot = getSharedStateSnapshot(state);
      const serializedSnapshot = serializeSnapshot(snapshot);

      if (serializedSnapshot === latestSnapshotSerializedRef.current) {
        return;
      }

      latestSnapshotSerializedRef.current = serializedSnapshot;

      if (!syncReadyRef.current || applyRemoteInProgressRef.current) {
        return;
      }

      pendingSnapshotRef.current = snapshot;
      scheduleSave();
    });

    const maybeWaitForHydration = async () => {
      const persistApi = (useVisualKanbanStore as typeof useVisualKanbanStore & { persist?: PersistApi }).persist;
      if (!persistApi?.hasHydrated || persistApi.hasHydrated()) {
        return;
      }

      await new Promise<void>((resolve) => {
        const unlisten = persistApi.onFinishHydration?.(() => {
          unlisten?.();
          resolve();
        });
        if (!unlisten) {
          resolve();
        }
      });
    };

    const bootstrap = async () => {
      const initialSnapshot = getSharedStateSnapshot(useVisualKanbanStore.getState());
      latestSnapshotSerializedRef.current = serializeSnapshot(initialSnapshot);

      await maybeWaitForHydration();
      if (unmounted) return;

      const hydratedSnapshot = getSharedStateSnapshot(useVisualKanbanStore.getState());
      latestSnapshotSerializedRef.current = serializeSnapshot(hydratedSnapshot);

      const remoteState = await fetchRemoteState();
      if (unmounted) {
        return;
      }

      if (remoteState?.snapshot) {
        applyRemoteSnapshot(remoteState);
      }

      syncReadyRef.current = true;
      const syncedSnapshot = getSharedStateSnapshot(useVisualKanbanStore.getState());
      latestSnapshotSerializedRef.current = serializeSnapshot(syncedSnapshot);

      if (!remoteState?.snapshot) {
        pendingSnapshotRef.current = syncedSnapshot;
        scheduleSave();
      }
    };

    void bootstrap();

    const pollingHandle = window.setInterval(() => {
      if (!syncReadyRef.current || saveInProgressRef.current || applyRemoteInProgressRef.current || Boolean(pendingSnapshotRef.current)) {
        return;
      }

      void (async () => {
        const remoteState = await fetchRemoteState();
        if (!remoteState?.snapshot || unmounted) {
          return;
        }

        if (remoteState.version !== null && latestKnownVersionRef.current !== null && remoteState.version === latestKnownVersionRef.current) {
          return;
        }

        const currentSnapshot = getSharedStateSnapshot(useVisualKanbanStore.getState());
        const mergedRemoteSnapshot = mergePartialSnapshot({
          currentSnapshot,
          partialSnapshot: remoteState.snapshot
        });
        const mergedRemoteSerialized = serializeSnapshot(mergedRemoteSnapshot);

        if (mergedRemoteSerialized === latestSnapshotSerializedRef.current) {
          if (remoteState.version !== null) {
            latestKnownVersionRef.current = remoteState.version;
          }
          return;
        }

        applyRemoteSnapshot(remoteState);
      })();
    }, POLL_INTERVAL_MS);

    return () => {
      unmounted = true;
      abortController.abort();
      clearSaveTimer();
      window.clearInterval(pollingHandle);
      storeUnsubscribe();
    };
  }, [replaceSharedState]);

  return null;
}
