import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { FolderPlusIcon } from "lucide-react";
import { create } from "zustand";

import { useProjects, useThreadShell } from "../../state/entities";
import { useEnvironmentScope } from "../../state/session";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { ComposerContextLabel } from "../ComposerContextLabel";
import { Menu, MenuCheckboxItem, MenuGroupLabel, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ComposerControl } from "./ComposerControl";
import { useComposerMenuProps } from "./composerEventScope";

const EMPTY_PROJECT_IDS: ReadonlyArray<ProjectId> = [];

/** Picks made before a draft's first send, which launches the thread with them. */
const useDraftAdditionalProjectsStore = create<{
  readonly byThread: Readonly<Record<string, ReadonlyArray<ProjectId>>>;
  readonly set: (key: string, projectIds: ReadonlyArray<ProjectId>) => void;
}>((set) => ({
  byThread: {},
  set: (key, projectIds) =>
    set((state) => ({ byThread: { ...state.byThread, [key]: projectIds } })),
}));

export function readDraftAdditionalProjectIds(
  environmentId: EnvironmentId,
  threadId: ThreadId,
): ReadonlyArray<ProjectId> {
  return (
    useDraftAdditionalProjectsStore.getState().byThread[
      scopedThreadKey(scopeThreadRef(environmentId, threadId))
    ] ?? EMPTY_PROJECT_IDS
  );
}

/**
 * Lets one thread's agent work across several projects in its environment. The thread keeps its
 * own project for its cwd, branch and checkpoints; the others are passed to the provider as extra
 * directories it may read and edit.
 */
export function AdditionalProjectsControl(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly isServerThread: boolean;
}) {
  const composerMenuProps = useComposerMenuProps();
  const threadRef = scopeThreadRef(props.environmentId, props.threadId);
  const draftKey = scopedThreadKey(threadRef);
  const serverThread = useThreadShell(props.isServerThread ? threadRef : null);
  const draftSelection = useDraftAdditionalProjectsStore((state) => state.byThread[draftKey]);
  const setDraftSelection = useDraftAdditionalProjectsStore((state) => state.set);
  const canOperate = useEnvironmentScope(props.environmentId, AuthOrchestrationOperateScope);
  const updateMetadata = useAtomCommand(threadEnvironment.updateMetadata, "thread projects update");
  const candidates = useProjects().filter(
    (project) =>
      project.environmentId === props.environmentId &&
      project.id !== props.projectId &&
      project.isScratch !== true,
  );

  const selected = props.isServerThread
    ? (serverThread?.additionalProjectIds ?? EMPTY_PROJECT_IDS)
    : (draftSelection ?? EMPTY_PROJECT_IDS);
  const selectedProjects = candidates.filter((project) => selected.includes(project.id));
  if (candidates.length === 0) return null;

  const toggle = (projectId: ProjectId, checked: boolean) => {
    const next = checked
      ? [...selected.filter((id) => id !== projectId), projectId]
      : selected.filter((id) => id !== projectId);
    if (!props.isServerThread) {
      setDraftSelection(draftKey, next);
      return;
    }
    void updateMetadata({
      environmentId: props.environmentId,
      input: { threadId: props.threadId, additionalProjectIds: next },
    });
  };

  const label =
    selectedProjects.length === 0
      ? "Add project"
      : selectedProjects.length === 1
        ? `+ ${selectedProjects[0]!.title}`
        : `+ ${selectedProjects.length} projects`;

  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              disabled={props.isServerThread && !canOperate}
              render={
                <ComposerControl
                  size="xs"
                  className="min-w-0 shrink-0"
                  aria-label={`Additional projects: ${selectedProjects.length}`}
                  data-composer-context-control
                />
              }
            />
          }
        >
          <FolderPlusIcon aria-hidden="true" className="size-3" />
          <ComposerContextLabel>{label}</ComposerContextLabel>
        </TooltipTrigger>
        <TooltipPopup>
          {selectedProjects.length === 0
            ? "Let the agent also work in other projects"
            : selectedProjects.map((project) => project.title).join(", ")}
        </TooltipPopup>
      </Tooltip>
      <MenuPopup side="top" align="end" {...composerMenuProps}>
        <MenuGroupLabel>Also work in</MenuGroupLabel>
        {candidates.map((project) => (
          <MenuCheckboxItem
            key={project.id}
            checked={selected.includes(project.id)}
            closeOnClick={false}
            onCheckedChange={(checked) => toggle(project.id, checked)}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{project.title}</span>
              <span className="truncate font-mono text-2xs text-muted-foreground">
                {project.workspaceRoot}
              </span>
            </span>
          </MenuCheckboxItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}
