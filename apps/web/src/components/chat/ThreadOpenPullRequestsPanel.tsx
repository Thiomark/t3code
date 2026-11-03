import type { EnvironmentId, ProjectId, PullRequestInvolvement, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { Schema } from "effect";
import { ChevronDown, ChevronUp } from "lucide";
import { ChevronDownIcon, ChevronRightIcon, ExternalLinkIcon, RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useOpenPrLink } from "../../lib/openPullRequestLink";
import { cn } from "../../lib/utils";
import { usePullRequestList } from "../../state/pullRequests";
import { useEnvironmentQuery } from "../../state/query";
import { vcsEnvironment } from "../../state/vcs";
import { MorphIcon } from "../MorphIcon";
import { PullRequestChecksPopover } from "../pullRequest/PullRequestChecksPopover";
import {
  PULL_REQUEST_ROW_NUMBER_CLASS,
  PullRequestRowGlyph,
  PullRequestRowLines,
} from "../pullRequest/PullRequestListRow";
import { filterPullRequestsByInvolvement } from "../pullRequest/pullRequestList.logic";
import { PullRequestReviewDecisionGlyph } from "../pullRequest/pullRequestPresentation";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ThreadDetailsControl } from "./ThreadDetailsControl";
import { ThreadDetailsSection } from "./ThreadDetailsSection";

const OPEN_PULL_REQUESTS_LIMIT = 30;
const OPEN_PULL_REQUESTS_PAGE = 5;
const COLLAPSED_STORAGE_KEY = "t3code:thread-details:open-pull-requests-collapsed";

const FILTERS: ReadonlyArray<{ readonly id: PullRequestInvolvement; readonly label: string }> = [
  { id: "all", label: "All" },
  { id: "authored", label: "Mine" },
  { id: "reviewing", label: "Review requested" },
];

interface ThreadOpenPullRequestsPanelProps {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly gitCwd: string;
  readonly onCheckoutPullRequestRequest?: ((reference: string) => void) | undefined;
}

/** Every open pull request in the thread's project, so their status is visible without leaving the thread. */
export function ThreadOpenPullRequestsPanel(props: ThreadOpenPullRequestsPanelProps) {
  const [collapsed, setCollapsed] = useLocalStorage(COLLAPSED_STORAGE_KEY, false, Schema.Boolean);
  const [involvement, setInvolvement] = useState<PullRequestInvolvement>("all");
  const [visibleCount, setVisibleCount] = useState(OPEN_PULL_REQUESTS_PAGE);
  const threadRef = scopeThreadRef(props.environmentId, props.threadId);
  const openPrLink = useOpenPrLink(threadRef);

  // A collapsed section asks for nothing, so it costs no provider calls.
  const targets = useMemo(
    () =>
      collapsed
        ? []
        : [
            {
              environmentId: props.environmentId,
              input: {
                state: "open" as const,
                projectId: props.projectId,
                limit: OPEN_PULL_REQUESTS_LIMIT,
              },
            },
          ],
    [collapsed, props.environmentId, props.projectId],
  );
  const list = usePullRequestList(targets);
  const status = useEnvironmentQuery(
    collapsed
      ? null
      : vcsEnvironment.status({ environmentId: props.environmentId, input: { cwd: props.gitCwd } }),
  );
  const currentBranch = status.data?.refName ?? null;

  const entries = useMemo(() => {
    if (!list.data) return [];
    const filtered = filterPullRequestsByInvolvement(
      list.data.entries,
      list.data.viewers,
      involvement,
    );
    // The current branch's PR leads, then the most recently updated.
    return [...filtered].toSorted((left, right) => {
      const leftCurrent = left.headBranch === currentBranch ? 1 : 0;
      const rightCurrent = right.headBranch === currentBranch ? 1 : 0;
      if (leftCurrent !== rightCurrent) return rightCurrent - leftCurrent;
      return right.updatedAt.localeCompare(left.updatedAt);
    });
  }, [currentBranch, involvement, list.data]);

  const totalCount = list.data?.entries.length;
  const hiddenCount = Math.max(0, entries.length - visibleCount);

  return (
    <ThreadDetailsSection
      headingId="thread-details-open-pull-requests-heading"
      title="Open pull requests"
      actions={
        <>
          {!collapsed ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <ThreadDetailsControl
                    size="icon-xs"
                    variant="ghost"
                    part="icon"
                    aria-label="Refresh pull requests"
                    disabled={list.isPending}
                    onClick={() => list.refresh()}
                  />
                }
              >
                <RefreshCwIcon
                  aria-hidden
                  className={cn("size-3", list.isPending && "animate-spin")}
                />
              </TooltipTrigger>
              <TooltipPopup side="left">Refresh</TooltipPopup>
            </Tooltip>
          ) : null}
          <ThreadDetailsControl
            size="icon-xs"
            variant="ghost"
            part="icon"
            aria-expanded={!collapsed}
            aria-controls="thread-details-open-pull-requests-list"
            aria-label={collapsed ? "Show open pull requests" : "Hide open pull requests"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronRightIcon aria-hidden className="size-3.5" />
            ) : (
              <ChevronDownIcon aria-hidden className="size-3.5" />
            )}
          </ThreadDetailsControl>
          {totalCount !== undefined && !collapsed ? (
            <span className="rounded-full bg-muted px-1.5 text-3xs tabular-nums text-muted-foreground">
              {totalCount}
            </span>
          ) : null}
        </>
      }
    >
      {/* The section hides itself when its body is empty, so a collapsed body still says so. */}
      <div id="thread-details-open-pull-requests-list">
        {collapsed ? (
          <span className="sr-only">Collapsed</span>
        ) : (
          <>
            <div role="tablist" aria-label="Filter pull requests" className="flex gap-1 px-2 pb-1.5">
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  role="tab"
                  aria-selected={involvement === filter.id}
                  onClick={() => {
                    setInvolvement(filter.id);
                    setVisibleCount(OPEN_PULL_REQUESTS_PAGE);
                  }}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-2xs font-medium transition-colors",
                    involvement === filter.id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {list.error && entries.length === 0 ? (
              <p className="px-2.5 py-1.5 text-2xs text-destructive">{list.error}</p>
            ) : list.data && entries.length === 0 ? (
              <p className="px-2.5 py-1.5 text-2xs text-muted-foreground">
                No open pull requests.
              </p>
            ) : !list.data ? (
              <p className="px-2.5 py-1.5 text-2xs text-muted-foreground">Loading…</p>
            ) : (
              <ul data-thread-details-pr-list className="m-0 list-none p-0">
                {entries.slice(0, visibleCount).map((entry) => {
                  const isCurrent = entry.headBranch === currentBranch;
                  return (
                    <li
                      key={`${entry.repository}#${entry.number}`}
                      className={cn(
                        "group relative flex items-center rounded-lg",
                        isCurrent && "bg-accent/60",
                      )}
                    >
                      <Tooltip>
                        <TooltipTrigger
                          delay={300}
                          render={
                            <ThreadDetailsControl
                              size="sm"
                              variant="ghost"
                              part="row"
                              multiline
                              aria-current={isCurrent ? "true" : undefined}
                              onClick={(event) => {
                                if (isCurrent || !props.onCheckoutPullRequestRequest) {
                                  openPrLink(event, entry.url);
                                  return;
                                }
                                props.onCheckoutPullRequestRequest(entry.url);
                              }}
                              onAuxClick={(event) => openPrLink(event, entry.url)}
                            />
                          }
                        >
                          <PullRequestRowGlyph
                            state={entry.state}
                            isDraft={entry.isDraft}
                            mergeability={entry.mergeability}
                            baseBranch={entry.baseBranch}
                            className="mt-0.5 self-start"
                          />
                          <span className="min-w-0 flex-1 pe-6 text-left">
                            <PullRequestRowLines
                              number={
                                <span className={PULL_REQUEST_ROW_NUMBER_CLASS}>
                                  #{entry.number}
                                </span>
                              }
                              title={entry.title}
                              signals={
                                <>
                                  {entry.checksState === undefined ? null : (
                                    <PullRequestChecksPopover
                                      checksState={entry.checksState}
                                      environmentId={entry.environmentId}
                                      reference={{
                                        projectId: entry.projectId,
                                        repository: entry.repository,
                                        number: entry.number,
                                      }}
                                    />
                                  )}
                                  {entry.reviewDecision === undefined ? null : (
                                    <PullRequestReviewDecisionGlyph
                                      decision={entry.reviewDecision}
                                    />
                                  )}
                                </>
                              }
                              meta={
                                <span className="min-w-0 truncate font-mono">
                                  {isCurrent ? "current · " : ""}
                                  {entry.headBranch}
                                </span>
                              }
                              updatedAt={entry.updatedAt}
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipPopup side="left">
                          {isCurrent
                            ? "Open this pull request"
                            : `Check out ${entry.headBranch}. Middle-click to open it.`}
                        </TooltipPopup>
                      </Tooltip>
                      <div className="pointer-events-none absolute right-1 top-1.5 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <ThreadDetailsControl
                                size="icon-xs"
                                variant="ghost"
                                part="icon"
                                aria-label={`Open #${entry.number}`}
                                onClick={(event) => openPrLink(event, entry.url)}
                              />
                            }
                          >
                            <ExternalLinkIcon aria-hidden className="size-3" />
                          </TooltipTrigger>
                          <TooltipPopup side="left">Open pull request</TooltipPopup>
                        </Tooltip>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {entries.length > OPEN_PULL_REQUESTS_PAGE ? (
              <ThreadDetailsControl
                variant="ghost"
                size="sm"
                part="row"
                tone="muted"
                className="w-full active:scale-100"
                onClick={() =>
                  setVisibleCount(
                    hiddenCount > 0
                      ? visibleCount + OPEN_PULL_REQUESTS_PAGE
                      : OPEN_PULL_REQUESTS_PAGE,
                  )
                }
              >
                <MorphIcon
                  aria-hidden
                  className="size-4 shrink-0"
                  icon={hiddenCount > 0 ? ChevronDown : ChevronUp}
                />
                {hiddenCount > 0
                  ? `Show ${Math.min(hiddenCount, OPEN_PULL_REQUESTS_PAGE)} more`
                  : "Show less"}
              </ThreadDetailsControl>
            ) : null}
          </>
        )}
      </div>
    </ThreadDetailsSection>
  );
}
