import type { EnvironmentId, ReviewFileBlameCommit, ReviewFileBlameResult } from "@t3tools/contracts";
import { GitCommitHorizontalIcon } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { RelativeTime } from "~/components/RelativeTime";
import { useEnvironmentQuery } from "~/state/query";
import { reviewEnvironment } from "~/state/review";

export const FILE_BLAME_HINT_ATTRIBUTE = "data-file-blame-hint";

/** Ghost text after the hovered line, like GitLens' current-line blame. */
export const FILE_BLAME_UNSAFE_CSS = `
  [${FILE_BLAME_HINT_ATTRIBUTE}][data-line]::after {
    content: attr(${FILE_BLAME_HINT_ATTRIBUTE});
    margin-inline-start: 3ch;
    color: color-mix(in lab, currentColor 45%, transparent);
    font-style: italic;
    pointer-events: none;
    user-select: none;
    white-space: pre;
  }
`;

const UNCOMMITTED_SHA = /^0+$/;
const HOVER_DELAY_MS = 350;

interface BlameLookup {
  readonly commitForLine: (line: number) => ReviewFileBlameCommit | null;
}

function buildLookup(blame: ReviewFileBlameResult | null): BlameLookup | null {
  if (!blame || !blame.tracked || blame.ranges.length === 0) return null;
  const commits = new Map(blame.commits.map((commit) => [commit.sha, commit]));
  const ranges = blame.ranges;
  return {
    commitForLine: (line) => {
      // Ranges arrive sorted by line, so a binary search keeps hover cheap on long files.
      let low = 0;
      let high = ranges.length - 1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        const range = ranges[middle]!;
        if (line < range.startLine) high = middle - 1;
        else if (line >= range.startLine + range.lineCount) low = middle + 1;
        else return commits.get(range.sha) ?? null;
      }
      return null;
    },
  };
}

function shortRelative(iso: string): string {
  const seconds = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  const units: Array<[number, string]> = [
    [31_536_000, "year"],
    [2_592_000, "month"],
    [604_800, "week"],
    [86_400, "day"],
    [3_600, "hour"],
    [60, "minute"],
  ];
  for (const [size, unit] of units) {
    const value = Math.floor(seconds / size);
    if (value >= 1) return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

function hintFor(commit: ReviewFileBlameCommit): string {
  if (UNCOMMITTED_SHA.test(commit.sha)) return "You, uncommitted changes";
  return `${commit.authorName}, ${shortRelative(commit.authoredAt)} • ${commit.summary}`;
}

/** The line a pointer event is over, read from the editor's shadow DOM. */
function lineFromEvent(event: ReactPointerEvent<HTMLElement>): HTMLElement | null {
  for (const target of event.nativeEvent.composedPath()) {
    if (!(target instanceof HTMLElement)) continue;
    if (target.hasAttribute("data-line")) return target;
    if (target.hasAttribute("data-column-number")) {
      const line = target.getAttribute("data-column-number");
      return (
        (target.getRootNode() as ShadowRoot | Document).querySelector<HTMLElement>(
          `[data-line="${line}"]`,
        ) ?? null
      );
    }
    if (target === event.currentTarget) return null;
  }
  return null;
}

interface HoverState {
  readonly line: number;
  readonly commit: ReviewFileBlameCommit;
  readonly x: number;
  readonly y: number;
}

/**
 * Shows who last changed the hovered line, when, and why. The blame covers the saved file, so
 * lines edited since the last save can point at a neighbouring commit until the file is saved.
 */
export function useFileBlameHover(input: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string | null;
  readonly enabled: boolean;
}) {
  const blame = useEnvironmentQuery(
    input.enabled && input.relativePath !== null
      ? reviewEnvironment.fileBlame({
          environmentId: input.environmentId,
          input: { cwd: input.cwd, relativePath: input.relativePath },
        })
      : null,
  );
  const lookup = buildLookup(blame.data ?? null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const hintedRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearHint = () => {
    hintedRef.current?.removeAttribute(FILE_BLAME_HINT_ATTRIBUTE);
    hintedRef.current = null;
  };
  const cancelTimer = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!lookup) return;
    const element = lineFromEvent(event);
    const line = Number(element?.getAttribute("data-line"));
    if (!element || !Number.isSafeInteger(line)) {
      cancelTimer();
      clearHint();
      setHover(null);
      return;
    }
    if (hover?.line === line && hintedRef.current === element) return;
    const commit = lookup.commitForLine(line);
    if (!commit) return;
    clearHint();
    element.setAttribute(FILE_BLAME_HINT_ATTRIBUTE, hintFor(commit));
    hintedRef.current = element;
    cancelTimer();
    setHover(null);
    const { clientX, clientY } = event;
    timerRef.current = window.setTimeout(() => {
      setHover({ line, commit, x: clientX, y: clientY });
    }, HOVER_DELAY_MS);
  };

  const onPointerLeave = () => {
    cancelTimer();
    clearHint();
    setHover(null);
  };

  const overlay =
    hover === null ? null : (
      <div
        role="tooltip"
        className="pointer-events-none fixed z-50 w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-lg"
        style={{
          left: Math.min(hover.x + 12, window.innerWidth - 330),
          top: hover.y + 18,
        }}
      >
        {UNCOMMITTED_SHA.test(hover.commit.sha) ? (
          <p className="text-muted-foreground">Not committed yet</p>
        ) : (
          <>
            <div className="flex items-center gap-1.5 font-medium">
              <span className="truncate">{hover.commit.authorName}</span>
              {hover.commit.authorEmail ? (
                <span className="truncate font-normal text-muted-foreground">
                  {hover.commit.authorEmail}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 text-muted-foreground">
              <RelativeTime timestamp={hover.commit.authoredAt} />
              {" · "}
              {new Date(hover.commit.authoredAt).toLocaleString()}
            </div>
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap">{hover.commit.summary}</p>
            <div className="mt-2 flex items-center gap-1 font-mono text-2xs text-muted-foreground">
              <GitCommitHorizontalIcon aria-hidden className="size-3" />
              {hover.commit.sha.slice(0, 8)}
            </div>
          </>
        )}
      </div>
    );

  return {
    available: lookup !== null,
    refresh: blame.refresh,
    handlers: lookup ? { onPointerMove, onPointerLeave } : {},
    overlay,
  };
}
