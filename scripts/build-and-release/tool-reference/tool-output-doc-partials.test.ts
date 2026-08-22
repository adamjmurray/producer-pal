// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
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

  // The generated page prints the call verbatim, so an example is documentation
  // whether or not it reads like it. An alias or a deprecated param teaches a
  // name that exists only to catch a guess; a param the tool dropped teaches one
  // that no longer works, and the tool answers it with an ignored-argument
  // warning that then ships in the docs.
  it("calls every tool by its published params", () => {
    const offenders = TOOL_EXAMPLES.flatMap((example) => {
      const def = [...STANDARD_TOOL_DEFS, toolDefLiveApi].find(
        (td) => td.toolName === example.toolName,
      );
      const { published } = resolveToolSchema(
        (def as ToolDefFunction).toolOptions.inputSchema,
        {},
      );

      return Object.keys(example.args)
        .filter((key) => !(key in published))
        .map((key) => `${example.toolName}: ${key}`);
    });

    expect(offenders).toStrictEqual([]);
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
    expect(markdown).toContain(
      "`ppal-read-track` does not return them as fields",
    );
    expect(markdown).toContain("[Context & Memory](/guide/context)");
    expect(markdown).toContain('<div class="wrapped-code">');
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
