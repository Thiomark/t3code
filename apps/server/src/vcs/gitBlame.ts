import type {
  ReviewFileBlameCommit,
  ReviewFileBlameRange,
  ReviewFileBlameResult,
} from "@t3tools/contracts";

const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SUMMARY_LIMIT = 300;

/**
 * Parses `git blame --porcelain` output into commits and line ranges. Porcelain prints a header
 * per line and the commit's details only the first time a sha appears, so adjacent lines from
 * one commit fold into a single range. A truncated final record is dropped.
 */
export function parseGitBlamePorcelain(
  stdout: string,
): Pick<ReviewFileBlameResult, "commits" | "ranges"> {
  const commits = new Map<string, ReviewFileBlameCommit>();
  const ranges: ReviewFileBlameRange[] = [];
  const lines = stdout.split("\n");
  let current: { sha: string; line: number; draft: Partial<ReviewFileBlameCommit> } | null = null;

  for (const line of lines) {
    if (current === null) {
      const [sha, , finalLine] = line.split(" ");
      if (sha === undefined || !SHA_PATTERN.test(sha) || finalLine === undefined) continue;
      const lineNumber = Number(finalLine);
      if (!Number.isSafeInteger(lineNumber) || lineNumber < 1) continue;
      current = { sha, line: lineNumber, draft: {} };
      continue;
    }
    if (line.startsWith("\t")) {
      const { sha, line: lineNumber, draft } = current;
      if (!commits.has(sha)) {
        commits.set(sha, {
          sha,
          authorName: draft.authorName ?? "",
          authorEmail: draft.authorEmail ?? "",
          authoredAt: draft.authoredAt ?? "",
          summary: draft.summary ?? "",
        });
      }
      const previous = ranges.at(-1);
      if (
        previous !== undefined &&
        previous.sha === sha &&
        previous.startLine + previous.lineCount === lineNumber
      ) {
        ranges[ranges.length - 1] = { ...previous, lineCount: previous.lineCount + 1 };
      } else {
        ranges.push({ startLine: lineNumber, lineCount: 1, sha });
      }
      current = null;
      continue;
    }
    const space = line.indexOf(" ");
    const key = space < 0 ? line : line.slice(0, space);
    const value = space < 0 ? "" : line.slice(space + 1);
    if (key === "author") current.draft.authorName = value;
    else if (key === "author-mail") current.draft.authorEmail = value.replace(/^<|>$/g, "");
    else if (key === "author-time") {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) {
        current.draft.authoredAt = new Date(seconds * 1000).toISOString();
      }
    } else if (key === "summary") current.draft.summary = value.slice(0, SUMMARY_LIMIT);
  }

  return { commits: [...commits.values()], ranges };
}

/** Rejects paths that could leave the worktree before they reach git. */
export function isSafeBlamePath(relativePath: string): boolean {
  if (relativePath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(relativePath)) return false;
  return !relativePath.split(/[\\/]/).some((segment) => segment === "..");
}
