import { canManageProjectMembers, canWrite, resolveRole } from "@/lib/permissions/roles";
import type {
  Activity,
  FeatureKey,
  PermissionAssignment,
  PersonalTodo,
  ProjectMembership,
  Task,
  TaskComment,
  User,
  WhiteboardScene,
  VisualKanbanSharedSnapshot
} from "@/lib/types";

interface EntityWithId {
  id: string;
}

interface UpdatedEntity<T> {
  before: T;
  after: T;
}

interface CollectionDiff<T extends EntityWithId> {
  added: T[];
  removed: T[];
  updated: UpdatedEntity<T>[];
}

interface AuthorizationContext {
  actorUserId: string;
  actorCurrent: User | null;
  actorNext: User | null;
  currentState: VisualKanbanSharedSnapshot;
  nextState: VisualKanbanSharedSnapshot;
}

export type WorkspaceStateAuthorizationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
    };

function isDeepEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diffById<T extends EntityWithId>(before: T[], after: T[]): CollectionDiff<T> {
  const beforeById = new Map(before.map((entry) => [entry.id, entry]));
  const afterById = new Map(after.map((entry) => [entry.id, entry]));

  const added: T[] = [];
  const removed: T[] = [];
  const updated: UpdatedEntity<T>[] = [];

  for (const entry of after) {
    const previous = beforeById.get(entry.id);
    if (!previous) {
      added.push(entry);
      continue;
    }

    if (!isDeepEqual(previous, entry)) {
      updated.push({ before: previous, after: entry });
    }
  }

  for (const entry of before) {
    if (!afterById.has(entry.id)) {
      removed.push(entry);
    }
  }

  return {
    added,
    removed,
    updated
  };
}

function changedRecordKeys<T>(before: Record<string, T>, after: Record<string, T>) {
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  const changedKeys: string[] = [];

  for (const key of keys) {
    if (!isDeepEqual(before[key], after[key])) {
      changedKeys.push(key);
    }
  }

  return changedKeys;
}

function collectProjectIdsFromDiff<T extends EntityWithId & { projectId: string }>(diff: CollectionDiff<T>) {
  const projectIds = new Set<string>();

  for (const entry of diff.added) {
    projectIds.add(entry.projectId);
  }

  for (const entry of diff.removed) {
    projectIds.add(entry.projectId);
  }

  for (const entry of diff.updated) {
    projectIds.add(entry.before.projectId);
    projectIds.add(entry.after.projectId);
  }

  return projectIds;
}

function canActorWriteFeature({
  actor,
  state,
  projectId,
  feature
}: {
  actor: User;
  state: Pick<VisualKanbanSharedSnapshot, "projects" | "projectMemberships" | "permissions">;
  projectId: string;
  feature: FeatureKey;
}) {
  return canWrite(
    resolveRole({
      user: actor,
      projectId,
      feature,
      assignments: state.permissions,
      projectMemberships: state.projectMemberships,
      projects: state.projects
    })
  );
}

function validateKanbanCommentMutations({
  actorUserId,
  currentTasks,
  nextTasks
}: {
  actorUserId: string;
  currentTasks: Task[];
  nextTasks: Task[];
}): WorkspaceStateAuthorizationResult {
  const currentTaskById = new Map(currentTasks.map((task) => [task.id, task]));

  for (const nextTask of nextTasks) {
    const currentTask = currentTaskById.get(nextTask.id);
    const nextComments = nextTask.comments ?? [];

    if (!currentTask) {
      const invalidNewComment = nextComments.find((comment) => comment.authorId !== actorUserId);
      if (invalidNewComment) {
        return {
          ok: false,
          reason: "Only the actor can author newly added kanban comments."
        };
      }
      continue;
    }

    const commentDiff = diffById<TaskComment>(currentTask.comments ?? [], nextComments);

    const invalidAddedComment = commentDiff.added.find((comment) => comment.authorId !== actorUserId);
    if (invalidAddedComment) {
      return {
        ok: false,
        reason: "New kanban comments must use the actor as author."
      };
    }

    const forbiddenRemovedComment = commentDiff.removed.find((comment) => comment.authorId !== actorUserId);
    if (forbiddenRemovedComment) {
      return {
        ok: false,
        reason: "Only the comment author can delete an existing kanban comment."
      };
    }

    const forbiddenUpdatedComment = commentDiff.updated.find(
      (change) => change.before.authorId !== actorUserId || change.after.authorId !== actorUserId
    );
    if (forbiddenUpdatedComment) {
      return {
        ok: false,
        reason: "Only the comment author can edit an existing kanban comment."
      };
    }
  }

  return { ok: true };
}

function validateNonAdminUserMutations(context: AuthorizationContext): WorkspaceStateAuthorizationResult {
  const userDiff = diffById(context.currentState.users, context.nextState.users);

  if (userDiff.removed.length > 0) {
    return {
      ok: false,
      reason: "Non-admin users cannot remove accounts."
    };
  }

  if (userDiff.added.length > 0) {
    if (context.actorCurrent) {
      return {
        ok: false,
        reason: "Non-admin users cannot create additional accounts."
      };
    }

    if (userDiff.added.length !== 1 || userDiff.added[0]?.id !== context.actorUserId) {
      return {
        ok: false,
        reason: "A new non-admin actor may only register their own account."
      };
    }

    if (userDiff.added[0]?.baseRole !== "viewer") {
      return {
        ok: false,
        reason: "Self-registered accounts must remain viewer role."
      };
    }
  }

  for (const change of userDiff.updated) {
    if (change.before.id !== context.actorUserId) {
      return {
        ok: false,
        reason: "Non-admin users cannot modify other accounts."
      };
    }

    if (
      change.before.id !== change.after.id ||
      change.before.username !== change.after.username ||
      change.before.baseRole !== change.after.baseRole
    ) {
      return {
        ok: false,
        reason: "Non-admin account updates cannot change identity, username, or role."
      };
    }
  }

  if (context.actorCurrent && !context.actorNext) {
    return {
      ok: false,
      reason: "Non-admin users cannot remove their own account."
    };
  }

  return {
    ok: true
  };
}

function validateNonAdminProjectAdministration(context: AuthorizationContext): WorkspaceStateAuthorizationResult {
  const actor = context.actorCurrent;

  const manageableProjectIds = new Set<string>();
  if (actor) {
    for (const project of context.currentState.projects) {
      const canManage = canManageProjectMembers({
        actor,
        projectId: project.id,
        projectMemberships: context.currentState.projectMemberships,
        projects: context.currentState.projects
      });

      if (canManage) {
        manageableProjectIds.add(project.id);
      }
    }
  }

  const projectDiff = diffById(context.currentState.projects, context.nextState.projects);
  const actorOwnedNewProjectIds = new Set<string>();

  for (const addedProject of projectDiff.added) {
    if (addedProject.ownerId !== context.actorUserId) {
      return {
        ok: false,
        reason: "Non-admin users can only create projects they own."
      };
    }
    actorOwnedNewProjectIds.add(addedProject.id);
  }

  for (const removedProject of projectDiff.removed) {
    if (!manageableProjectIds.has(removedProject.id)) {
      return {
        ok: false,
        reason: "Non-admin users cannot delete projects they do not control."
      };
    }
  }

  for (const updatedProject of projectDiff.updated) {
    if (!manageableProjectIds.has(updatedProject.before.id)) {
      return {
        ok: false,
        reason: "Non-admin users cannot update projects they do not control."
      };
    }
  }

  const permittedProjectIds = new Set<string>([...manageableProjectIds, ...actorOwnedNewProjectIds]);

  const membershipDiff = diffById(context.currentState.projectMemberships, context.nextState.projectMemberships);
  const permissionDiff = diffById(context.currentState.permissions, context.nextState.permissions);

  const validateProjectBoundCollection = (
    collectionName: string,
    entries: Array<ProjectMembership | PermissionAssignment>
  ): WorkspaceStateAuthorizationResult | null => {
    for (const entry of entries) {
      if (!permittedProjectIds.has(entry.projectId)) {
        return {
          ok: false,
          reason: `Non-admin users cannot mutate ${collectionName} outside controlled projects.`
        };
      }
    }

    return null;
  };

  const membershipValidation = validateProjectBoundCollection("project memberships", [
    ...membershipDiff.added,
    ...membershipDiff.removed,
    ...membershipDiff.updated.flatMap((change) => [change.before, change.after])
  ]);
  if (membershipValidation) {
    return membershipValidation;
  }

  const permissionValidation = validateProjectBoundCollection("permissions", [
    ...permissionDiff.added,
    ...permissionDiff.removed,
    ...permissionDiff.updated.flatMap((change) => [change.before, change.after])
  ]);
  if (permissionValidation) {
    return permissionValidation;
  }

  return {
    ok: true
  };
}

function validateNonAdminWorkspaceAccountMaps(context: AuthorizationContext): WorkspaceStateAuthorizationResult {
  const changedWorkspacePreferenceAccounts = changedRecordKeys(
    context.currentState.workspacePreferencesByAccountId,
    context.nextState.workspacePreferencesByAccountId
  );

  if (changedWorkspacePreferenceAccounts.some((accountId) => accountId !== context.actorUserId)) {
    return {
      ok: false,
      reason: "Non-admin users can only update their own workspace preferences."
    };
  }

  const changedRecentProjectAccounts = changedRecordKeys(context.currentState.recentProjectIdByAccountId, context.nextState.recentProjectIdByAccountId);
  if (changedRecentProjectAccounts.some((accountId) => accountId !== context.actorUserId)) {
    return {
      ok: false,
      reason: "Non-admin users can only update their own recent project selection."
    };
  }

  return {
    ok: true
  };
}

function validateNonAdminPersonalTodoMutations(context: AuthorizationContext): WorkspaceStateAuthorizationResult {
  const todoDiff = diffById<PersonalTodo>(context.currentState.personalTodos, context.nextState.personalTodos);

  for (const todo of todoDiff.added) {
    if (todo.ownerId !== context.actorUserId) {
      return {
        ok: false,
        reason: "Non-admin users can only create their own personal todos."
      };
    }
  }

  for (const todo of todoDiff.removed) {
    if (todo.ownerId !== context.actorUserId) {
      return {
        ok: false,
        reason: "Non-admin users can only delete their own personal todos."
      };
    }
  }

  for (const change of todoDiff.updated) {
    if (change.before.ownerId !== context.actorUserId || change.after.ownerId !== context.actorUserId) {
      return {
        ok: false,
        reason: "Non-admin users can only update their own personal todos."
      };
    }
  }

  return {
    ok: true
  };
}

function validateNonAdminProjectScopedWrites(context: AuthorizationContext): WorkspaceStateAuthorizationResult {
  const actor = context.actorNext;
  if (!actor) {
    return {
      ok: false,
      reason: "Actor account is missing from the target workspace state."
    };
  }

  const permissionState = {
    projects: context.nextState.projects,
    projectMemberships: context.nextState.projectMemberships,
    permissions: context.nextState.permissions
  };

  const requireFeatureWrite = ({
    diff,
    feature,
    collectionName
  }: {
    diff: CollectionDiff<{ projectId: string; id: string }>;
    feature: FeatureKey;
    collectionName: string;
  }): WorkspaceStateAuthorizationResult | null => {
    const touchedProjectIds = collectProjectIdsFromDiff(diff);

    for (const projectId of touchedProjectIds) {
      if (!canActorWriteFeature({ actor, state: permissionState, projectId, feature })) {
        return {
          ok: false,
          reason: `Non-admin users cannot mutate ${collectionName} without ${feature} write permission.`
        };
      }
    }

    return null;
  };

  const taskValidation = requireFeatureWrite({
    diff: diffById<Task>(context.currentState.tasks, context.nextState.tasks),
    feature: "gantt",
    collectionName: "tasks"
  });
  if (taskValidation) {
    return taskValidation;
  }

  const kanbanTaskValidation = requireFeatureWrite({
    diff: diffById<Task>(context.currentState.kanbanTasks, context.nextState.kanbanTasks),
    feature: "kanban",
    collectionName: "kanban tasks"
  });
  if (kanbanTaskValidation) {
    return kanbanTaskValidation;
  }

  const kanbanHistoryValidation = requireFeatureWrite({
    diff: diffById(context.currentState.kanbanHistory, context.nextState.kanbanHistory),
    feature: "kanban",
    collectionName: "kanban history"
  });
  if (kanbanHistoryValidation) {
    return kanbanHistoryValidation;
  }

  const whiteboardDiff = diffById<WhiteboardScene>(context.currentState.whiteboardScenes, context.nextState.whiteboardScenes);
  const whiteboardValidation = requireFeatureWrite({
    diff: whiteboardDiff,
    feature: "whiteboard",
    collectionName: "whiteboard scenes"
  });
  if (whiteboardValidation) {
    return whiteboardValidation;
  }

  for (const scene of whiteboardDiff.added) {
    if (scene.updatedBy !== context.actorUserId) {
      return {
        ok: false,
        reason: "Whiteboard scene writes must be attributed to the actor."
      };
    }
  }

  for (const scene of whiteboardDiff.updated) {
    if (scene.after.updatedBy !== context.actorUserId) {
      return {
        ok: false,
        reason: "Whiteboard scene updates must be attributed to the actor."
      };
    }
  }

  return {
    ok: true
  };
}

function validateNonAdminActivityMutations(context: AuthorizationContext): WorkspaceStateAuthorizationResult {
  const activityDiff = diffById<Activity>(context.currentState.activities, context.nextState.activities);

  if (activityDiff.updated.length > 0) {
    return {
      ok: false,
      reason: "Existing activities cannot be edited."
    };
  }

  const invalidActivity = activityDiff.added.find((activity) => activity.actorId !== context.actorUserId);
  if (invalidActivity) {
    return {
      ok: false,
      reason: "New activities must be attributed to the actor."
    };
  }

  return {
    ok: true
  };
}

function asFailure(reason: string): WorkspaceStateAuthorizationResult {
  return {
    ok: false,
    reason
  };
}

function runValidation(
  result: WorkspaceStateAuthorizationResult,
  onFailure: (reason: string) => WorkspaceStateAuthorizationResult
): WorkspaceStateAuthorizationResult {
  if (result.ok) {
    return result;
  }

  return onFailure(result.reason);
}

export function authorizeWorkspaceStateMutation({
  actorUserId,
  currentState,
  nextState
}: {
  actorUserId: string;
  currentState: VisualKanbanSharedSnapshot;
  nextState: VisualKanbanSharedSnapshot;
}): WorkspaceStateAuthorizationResult {
  const actorCurrent = currentState.users.find((user) => user.id === actorUserId) ?? null;
  const actorNext = nextState.users.find((user) => user.id === actorUserId) ?? null;

  if (!actorCurrent && !actorNext) {
    return asFailure("Authenticated actor is not part of the workspace.");
  }

  const commentValidation = runValidation(
    validateKanbanCommentMutations({
      actorUserId,
      currentTasks: currentState.kanbanTasks,
      nextTasks: nextState.kanbanTasks
    }),
    (reason) => asFailure(`Kanban comment authorization failed: ${reason}`)
  );
  if (!commentValidation.ok) {
    return commentValidation;
  }

  if (actorCurrent?.baseRole === "admin") {
    return {
      ok: true
    };
  }

  const context: AuthorizationContext = {
    actorUserId,
    actorCurrent,
    actorNext,
    currentState,
    nextState
  };

  const validators: Array<() => WorkspaceStateAuthorizationResult> = [
    () => validateNonAdminUserMutations(context),
    () => validateNonAdminProjectAdministration(context),
    () => validateNonAdminWorkspaceAccountMaps(context),
    () => validateNonAdminPersonalTodoMutations(context),
    () => validateNonAdminProjectScopedWrites(context),
    () => validateNonAdminActivityMutations(context)
  ];

  for (const validator of validators) {
    const validationResult = validator();
    if (!validationResult.ok) {
      return asFailure(validationResult.reason);
    }
  }

  return {
    ok: true
  };
}
