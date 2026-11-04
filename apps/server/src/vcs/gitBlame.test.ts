import { describe, expect, it } from "vite-plus/test";

import { isSafeBlamePath, parseGitBlamePorcelain } from "./gitBlame.ts";

const A = "a".repeat(40);
const B = "b".repeat(40);
const ZERO = "0".repeat(40);

// Porcelain prints a commit's details only on its first line; later lines carry just the header.
const PORCELAIN = [
  `${A} 1 1 2`,
  "author Ada Lovelace",
  "author-mail <ada@example.com>",
  "author-time 1700000000",
  "author-tz +0000",
  "summary Add the engine",
  "filename src/engine.ts",
  "\tconst engine = 1;",
  `${A} 2 2`,
  "\tconst gears = 2;",
  `${B} 3 3 1`,
  "author Grace Hopper",
  "author-mail <grace@example.com>",
  "author-time 1710000000",
  "summary Fix the bug",
  "previous " + A + " src/engine.ts",
  "filename src/engine.ts",
  "\tconst bug = 0;",
  `${A} 4 4 1`,
  "\tconst tail = 4;",
  `${ZERO} 5 5 1`,
  "author Not Committed Yet",
  "author-mail <not.committed.yet>",
  "author-time 1720000000",
  "summary Version of src/engine.ts from src/engine.ts",
  "filename src/engine.ts",
  "\tconst draft = 5;",
  "",
].join("\n");

describe("parseGitBlamePorcelain", () => {
  it("folds adjacent lines of one commit and keeps each commit's details once", () => {
    const { commits, ranges } = parseGitBlamePorcelain(PORCELAIN);
    expect(ranges).toEqual([
      { startLine: 1, lineCount: 2, sha: A },
      { startLine: 3, lineCount: 1, sha: B },
      { startLine: 4, lineCount: 1, sha: A },
      { startLine: 5, lineCount: 1, sha: ZERO },
    ]);
    expect(commits).toEqual([
      {
        sha: A,
        authorName: "Ada Lovelace",
        authorEmail: "ada@example.com",
        authoredAt: new Date(1700000000 * 1000).toISOString(),
        summary: "Add the engine",
      },
      {
        sha: B,
        authorName: "Grace Hopper",
        authorEmail: "grace@example.com",
        authoredAt: new Date(1710000000 * 1000).toISOString(),
        summary: "Fix the bug",
      },
      expect.objectContaining({ sha: ZERO, authorName: "Not Committed Yet" }),
    ]);
  });

  it("drops a record cut off by the output limit", () => {
    const cut = PORCELAIN.slice(0, PORCELAIN.indexOf("\tconst bug"));
    expect(parseGitBlamePorcelain(cut).ranges).toEqual([{ startLine: 1, lineCount: 2, sha: A }]);
  });
});

describe("isSafeBlamePath", () => {
  it.each([
    ["src/engine.ts", true],
    ["a/..b/c.ts", true],
    ["../outside.ts", false],
    ["src/../../outside.ts", false],
    ["/etc/passwd", false],
    ["C:\\Windows\\win.ini", false],
  ])("%s → %s", (path, safe) => {
    expect(isSafeBlamePath(path)).toBe(safe);
  });
});
