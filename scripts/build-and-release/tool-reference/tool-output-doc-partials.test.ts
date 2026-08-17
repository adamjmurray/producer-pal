// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";
import { TOOL_EXAMPLES } from "./example-live-set/calls.ts";
import { type ExampleRun } from "./example-live-set/runner.ts";
import { generateOutputPartial } from "./tool-output-doc-partials.ts";

// docs/_generated/ is gitignored, so this asserts on what the generator
// produces rather than on files on disk. Running the tools themselves needs the
// mock Live API installed as a global, which the generator script does.

describe("TOOL_EXAMPLES", () => {
  it("covers every documented tool exactly once", () => {
    const documented = [...STANDARD_TOOL_DEFS, toolDefLiveApi].map(
      (def) => def.toolName,
    );
    const examples = TOOL_EXAMPLES.map((example) => example.toolName);

    expect(examples.toSorted()).toStrictEqual(documented.toSorted());
  });
});

describe("generateOutputPartial", () => {
  const example = { toolName: "ppal-read-track", args: { trackIndex: 0 } };

  it("shows the call and its result", () => {
    const markdown = generateOutputPartial({
      example,
      output: { id: "101", name: "Drums" },
      warnings: [],
    });

    expect(markdown).toContain('Called with `{"trackIndex":0}`');
    expect(markdown).toContain('"name": "Drums"');
  });

  it("reports a failed call instead of an empty result", () => {
    const run: ExampleRun = { example, warnings: [], error: "boom" };

    expect(generateOutputPartial(run)).toContain("boom");
    expect(generateOutputPartial(run)).not.toContain("```json");
  });

  it("shows the text blocks appended after the JSON result", () => {
    const markdown = generateOutputPartial({
      example,
      output: {},
      warnings: [],
      appended: ["Global context (all projects):\n\nKeep it short."],
    });

    expect(markdown).toContain("Global context (all projects):");
    expect(markdown).toContain("Keep it short.");
  });

  it("stubs out a block too long to reprint", () => {
    const markdown = generateOutputPartial({
      example,
      output: {},
      warnings: [],
      appended: [
        ["# Producer Pal Skills", ...Array(40).fill("body")].join("\n"),
      ],
    });

    expect(markdown).toContain("# Producer Pal Skills");
    expect(markdown).toContain("… 38 more lines");
  });

  it("shows warnings the tool appended to the result", () => {
    const markdown = generateOutputPartial({
      example,
      output: {},
      warnings: ["track 5 does not exist"],
    });

    expect(markdown).toContain("track 5 does not exist");
  });
});
