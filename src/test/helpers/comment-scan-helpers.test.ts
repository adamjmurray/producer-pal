// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  commentDensity,
  scanCommentFile,
  scanComments,
  scanCommentTree,
  summarizeComments,
} from "./comment-scan-helpers.ts";
import { projectRoot } from "./meta-test-helpers.ts";

// The directive names are pasted together from pieces on purpose: this file
// would otherwise read as a suppression itself, since
// src/test/lint-suppression-limits.test.ts scans lines rather than parsing them.
const DISABLE = "disable";
const IGNORE = "ignore";
const EXPECT = "expect";

const LICENSE = [
  "// Producer Pal",
  "// Copyright (C) 2026 Adam Murray",
  "// AI assistance: Claude (Anthropic)",
  "// SPDX-License-Identifier: GPL-3.0-or-later",
].join("\n");

describe("scanComments", () => {
  it("should not count the license header", () => {
    expect(scanComments(`${LICENSE}\n\nexport const x = 1;\n`)).toStrictEqual({
      commentLines: 0,
      codeLines: 1,
      longestBlock: 0,
      longestBlockLine: 0,
      blocks: [],
    });
  });

  it("should not count a license header below a shebang", () => {
    const source = `#!/usr/bin/env node\n${LICENSE}\n\n// real\nconst x = 1;\n`;

    expect(scanComments(source)).toStrictEqual({
      commentLines: 1,
      codeLines: 1,
      longestBlock: 1,
      longestBlockLine: 7,
      blocks: [],
    });
  });

  it("should count a top-of-file block that is not a license header", () => {
    const source = "// one\n// two\nconst x = 1;\n";

    expect(scanComments(source)).toStrictEqual({
      commentLines: 2,
      codeLines: 1,
      longestBlock: 2,
      longestBlockLine: 1,
      blocks: [],
    });
  });

  it("should count block comments and JSDoc line by line", () => {
    const source = [
      "/* a",
      "   b */",
      "/**",
      " * doc",
      " */",
      "function f() {}",
    ].join("\n");

    expect(scanComments(source)).toStrictEqual({
      commentLines: 5,
      codeLines: 1,
      longestBlock: 5,
      longestBlockLine: 1,
      blocks: [],
    });
  });

  it("should not count lint directives", () => {
    const source = [
      `// eslint-${DISABLE}-next-line no-console -- needed`,
      "console.log(1);",
      `/* v8 ${IGNORE} start -- untestable */`,
      `// @ts-${EXPECT}-error test`,
      "const x = 1;",
    ].join("\n");

    expect(scanComments(source)).toStrictEqual({
      commentLines: 0,
      codeLines: 2,
      longestBlock: 0,
      longestBlockLine: 0,
      blocks: [],
    });
  });

  it("should not treat comment markers inside strings as comments", () => {
    const source = [
      'const url = "https://example.com";',
      "const glob = `**/*.ts`;",
      'const fake = "/* not a comment */";',
      "const re = /a\\/\\/b/;",
      "const after = 1; // trailing",
    ].join("\n");

    expect(scanComments(source)).toStrictEqual({
      commentLines: 0,
      codeLines: 5,
      longestBlock: 0,
      longestBlockLine: 0,
      blocks: [],
    });
  });

  it("should not treat JSX text as a comment", () => {
    const source = "const el = <p>read // this</p>;\n";

    expect(scanComments(source, "component.tsx")).toStrictEqual({
      commentLines: 0,
      codeLines: 1,
      longestBlock: 0,
      longestBlockLine: 0,
      blocks: [],
    });
  });

  it("should measure the longest run of consecutive comment lines", () => {
    const source = [
      "// one",
      "const a = 1;",
      "// two",
      "// three",
      "// four",
      "",
      "// five",
      "// six",
      "const b = 2;",
    ].join("\n");

    expect(scanComments(source)).toStrictEqual({
      commentLines: 6,
      codeLines: 2,
      longestBlock: 3,
      longestBlockLine: 3,
      blocks: [],
    });
  });

  it("should report every block longer than maxBlockLines", () => {
    const source = [
      "// one",
      "// two",
      "const a = 1;",
      "// three",
      "// four",
      "// five",
      "const b = 2;",
      "// six",
      "// seven",
      "// eight",
      "// nine",
    ].join("\n");

    expect(scanComments(source, "source.ts", 2).blocks).toStrictEqual([
      { line: 4, lines: 3 },
      { line: 8, lines: 4 },
    ]);
  });

  it("should end a block at a directive", () => {
    const source = [
      "// one",
      "// two",
      `// oxlint-${DISABLE}-next-line no-console -- reason`,
      "// three",
      "console.log(1);",
    ].join("\n");

    expect(scanComments(source)).toStrictEqual({
      commentLines: 3,
      codeLines: 1,
      longestBlock: 2,
      longestBlockLine: 1,
      blocks: [],
    });
  });

  it("should count an empty source as nothing", () => {
    expect(scanComments("")).toStrictEqual({
      commentLines: 0,
      codeLines: 0,
      longestBlock: 0,
      longestBlockLine: 0,
      blocks: [],
    });
  });
});

describe("scanCommentFile", () => {
  it("should report the repo-relative path", () => {
    const stats = scanCommentFile(
      path.join(projectRoot, "src/test/helpers/comment-scan-helpers.ts"),
    );

    expect(stats.file).toBe("src/test/helpers/comment-scan-helpers.ts");
    expect(stats.codeLines).toBeGreaterThan(0);
    expect(stats.commentLines).toBeGreaterThan(0);
  });
});

describe("scanCommentTree", () => {
  it("should scan only the tree's non-test TypeScript sources", () => {
    const stats = scanCommentTree("e2e");

    expect(stats.length).toBeGreaterThan(0);

    for (const { file } of stats) {
      expect(file.startsWith("e2e/")).toBe(true);
      expect(file.endsWith(".ts") || file.endsWith(".tsx")).toBe(true);
      expect(file).not.toMatch(/\.spec\.ts$|-test-helpers\.ts$/);
    }
  });
});

describe("summarizeComments", () => {
  it("should total the counts and keep the longest block", () => {
    const stats = [
      {
        file: "a.ts",
        commentLines: 10,
        codeLines: 20,
        longestBlock: 8,
        longestBlockLine: 4,
        blocks: [],
      },
      {
        file: "b.ts",
        commentLines: 5,
        codeLines: 30,
        longestBlock: 10,
        longestBlockLine: 9,
        blocks: [{ line: 9, lines: 10 }],
      },
      {
        file: "c.ts",
        commentLines: 1,
        codeLines: 3,
        longestBlock: 1,
        longestBlockLine: 1,
        blocks: [],
      },
    ];

    expect(summarizeComments(stats)).toStrictEqual({
      files: 3,
      commentLines: 16,
      codeLines: 53,
      longestBlock: 10,
    });
  });

  it("should report zeros for no files", () => {
    expect(summarizeComments([])).toStrictEqual({
      files: 0,
      commentLines: 0,
      codeLines: 0,
      longestBlock: 0,
    });
  });
});

describe("commentDensity", () => {
  it("should report comment lines per code line to 3 decimals", () => {
    expect(commentDensity({ commentLines: 17, codeLines: 32 })).toBe(0.531);
  });

  it("should report zero for a file with no code", () => {
    expect(commentDensity({ commentLines: 4, codeLines: 0 })).toBe(0);
  });
});
